// Transporte WEB do Beepay Cloud (bep.tabletcloud.com.br): login próprio por e-mail/
// senha + postbacks WebForms, no servidor (sem o Chrome do usuário). Contratos
// validados ao vivo em 2026-10-17 (ver memória integracao-beepay-cloud). Campos são
// resolvidos pelo sufixo do name em tempo de execução; se o Beepay mudar a tela o erro
// lista os campos que existem. `debugDir` grava o HTML de cada passo (diagnóstico).
import { Sessao, formDe, textOf, alvoPostBack, postBackDe, semScripts } from './webforms.js'
import { BeepayNaoConfigurado, BeepayDesafio, BeepaySessaoExpirada, BeepayErro, BeepayLoginRecusado, BeepayIncerto } from './erros.js'
import { gerarXlsx } from './xlsx.js'

const BASE = process.env.BEEPAY_WEB_BASE || 'https://bep.tabletcloud.com.br'
// a própria tela chama GetProdutoGTIN só com { gtin } (conferido 2026-10-19)
const GTIN_PRIORIDADE = process.env.BEEPAY_GTIN_PRIORIDADE || ''
const normNome = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const COLUNAS_INVENTARIO = ['Codigo', 'CodigoVenda', 'Produto', 'Grupo', 'Unidade', 'Quantidade', 'UltimoCusto']

// desafio anti-bot de verdade (o campo vestigial g-recaptcha-response NÃO conta)
const DESAFIO = /data-sitekey|google\.com\/recaptcha|recaptcha\/api\.js|grecaptcha\.(?:execute|render)|hcaptcha\.com|challenges\.cloudflare\.com|cf-chl-/i
function checaDesafio(html) {
  if (DESAFIO.test(html || '')) throw new BeepayDesafio('Beepay exibiu reCAPTCHA/desafio no login — parei (não contorno). Logar manualmente e avisar.')
}
const ehLogin = (r) => /\/login\.aspx/i.test(new URL(r.url).pathname) || /name="txtSenha"/i.test(r.text || '')

// mensagem visível da página (swal/alert/label de mensagem) p/ erros legíveis
function mensagemDe(html) {
  const s = String(html || '')
  const sw = s.match(/(?:swal|alert)\(\s*(?:\{[^}]*?(?:title|text)\s*:\s*)?['"]([^'"]{3,200})['"]/i)
  if (sw) return sw[1]
  const lb = s.match(/<span[^>]+id="[^"]*(?:lblMsg|lblMensagem|lblErro|lblAviso)[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  return lb ? textOf(lb[1]) || null : null
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')
const brl = (n) => Number(n).toFixed(2).replace('.', ',')
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim(); if (!s) return null
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : null
}

// GetProdutoGTIN → CanonProduto (+ campos Beepay p/ escrita) ou null se a empresa não tem
export function mapGtin(ean, j) {
  const p = j?.EmpresaPossui && j.ProdutoEmpresa
  if (!p) return null
  return {
    codigoBarras: String(ean),
    nome: p.DescrCupom,
    precoReferencia: num(p.Valor),
    externalId: p.Codigo != null ? String(p.Codigo) : undefined,   // id interno (planilha "Codigo")
    codigoVenda: p.CodRef != null ? String(p.CodRef) : undefined,  // "CodigoVenda"
    grupoId: p.CodCategoria != null ? String(p.CodCategoria) : undefined,
    unidade: p.Unidade || undefined,
    ncm: p.CodNCM || undefined,
    cest: p.Cest || undefined,
    ativo: p.Status == null ? true : !/^(false|0|i|inativo)$/i.test(String(p.Status)),
  }
}

// trava de segurança: só grava se a tela de edição for do EAN esperado (txtEan, aba Configurações)
function exigeEan(tela, ean) {
  const atual = tela.has('txtEan') ? soDigitos(tela.field('txtEan').value) : null
  if (atual !== ean) throw new BeepayErro(`tela de edição é do EAN ${atual ?? '(sem txtEan)'}, esperado ${ean} — abortei p/ não gravar no produto errado`)
}

async function carregarImagem(p) {
  let data = p.imagem?.data || null
  if (!data && p.imagemUrl) {
    const r = await fetch(p.imagemUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null)
    if (!r?.ok) return null
    data = Buffer.from(await r.arrayBuffer())
  }
  if (!data || data.length < 64 || data.length > 4 * 1024 * 1024) return null
  const h = data.subarray(0, 4).toString('hex')
  const tipo = h === '89504e47' ? ['image/png', 'png'] : h.startsWith('ffd8ff') ? ['image/jpeg', 'jpg'] : h === '47494638' ? ['image/gif', 'gif'] : null
  return tipo ? { data, type: tipo[0], filename: `produto.${tipo[1]}` } : null // webp/svg: Beepay não confirmado
}

export class BeepayWeb {
  #email; #senha; #s = null; #seq = 0
  constructor({ email = process.env.BEEPAY_EMAIL, senha = process.env.BEEPAY_PASSWORD, debugDir = null, log = () => {} } = {}) {
    this.#email = email; this.#senha = senha
    this.debugDir = debugDir; this.log = log
  }
  get configurado() { return !!(this.#email && this.#senha) }

  // ── sessão ──────────────────────────────────────────────────────────────────
  async login() {
    if (!this.configurado) throw new BeepayNaoConfigurado('BEEPAY_EMAIL/BEEPAY_PASSWORD não configurados')
    const s = new Sessao(BASE)
    const r0 = await s.request('login.aspx')
    if (r0.status !== 200) throw new BeepayErro(`login.aspx: HTTP ${r0.status}`)
    checaDesafio(r0.text)
    const f = formDe(r0)
    f.set('txtEmail', this.#email).set('txtSenha', this.#senha)
    const r = await s.submit(f, { submitter: 'btnEntrar' })
    checaDesafio(r.text)
    if (r.status >= 400 || ehLogin(r)) {
      const msg = mensagemDe(r.text)
      throw new BeepayLoginRecusado(`login recusado (HTTP ${r.status}${msg ? `: ${msg}` : ''})`)
    }
    this.#s = s
    this.log(`login ok → ${new URL(r.url).pathname}`)
    return { ok: true, pagina: new URL(r.url).pathname }
  }

  // roda fn com sessão; se expirar no meio, reloga e repete UMA vez. As operações
  // começam checando o estado (buscarPorEan), então repetir não duplica nada.
  async #comSessao(fn) {
    if (!this.#s) await this.login()
    try { return await fn() } catch (e) {
      if (!(e instanceof BeepaySessaoExpirada)) throw e
      this.log('sessão expirou — relogando'); await this.login(); return fn()
    }
  }

  async #dump(label, r) {
    if (!this.debugDir) return
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(this.debugDir, { recursive: true })
    await writeFile(`${this.debugDir}/${String(++this.#seq).padStart(2, '0')}-${label}.html`, `<!-- ${r.status} ${r.url} -->\n${r.text}`)
  }
  #confere(r, oque) {
    if (ehLogin(r)) throw new BeepaySessaoExpirada(oque)
    if (r.status !== 200) throw new BeepayErro(`${oque}: HTTP ${r.status}${mensagemDe(r.text) ? ` — ${mensagemDe(r.text)}` : ''}`, { status: r.status })
    return r
  }
  async #get(path, label) {
    const r = await this.#s.request(path); await this.#dump(label, r)
    return formDe(this.#confere(r, `GET ${path}`))
  }
  async #post(form, opts, label) {
    const r = await this.#s.submit(form, opts); await this.#dump(label, r)
    return formDe(this.#confere(r, `postback ${label}`))
  }
  // aciona um botão: <input submit|image> vira submitter; LinkButton/onclick vira __EVENTTARGET
  async #acionar(form, chave, opts, label) {
    const f = form.match(chave).map(n => form.fields.find(x => x.name === n))[0]
    if (f && ['submit', 'image'].includes(f.type)) return this.#post(form, { ...opts, submitter: f.name }, label)
    const alvo = (f && postBackDe(f.attrs.onclick)?.target) || alvoPostBack(form.html, chave) || (f && f.name)
    if (!alvo) throw new BeepayErro(`controle ${chave} não encontrado em ${form.url}`)
    return this.#post(form, { ...opts, eventTarget: alvo }, label)
  }
  #setOpcao(form, chave, valor) {
    const ops = form.options(chave)
    if (!ops.some(o => o.value === valor)) throw new BeepayErro(`${chave}: opção "${valor}" não existe (${ops.map(o => o.value).join('|')})`)
    form.set(chave, valor)
  }

  // ── leitura ─────────────────────────────────────────────────────────────────
  /** resposta CRUA do GetProdutoGTIN: produto da empresa + base colaborativa (NCM/CEST) */
  async consultarGtin(ean) { return this.#comSessao(() => this.#gtin(ean)) }
  async #gtin(ean) {
    const qs = new URLSearchParams({ gtin: soDigitos(ean), ...(GTIN_PRIORIDADE ? { prioridade: GTIN_PRIORIDADE } : {}) })
    const r = await this.#s.request(`Ajax/GetProdutoGTIN.ashx?${qs}`, { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } })
    if (ehLogin(r)) throw new BeepaySessaoExpirada('GetProdutoGTIN')
    if (r.status !== 200) throw new BeepayErro(`GetProdutoGTIN: HTTP ${r.status}`)
    try { return r.json() } catch { throw new BeepayErro(`GetProdutoGTIN: resposta não-JSON (${r.text.slice(0, 80)})`) }
  }
  async buscarPorEan(ean) { return mapGtin(soDigitos(ean), await this.consultarGtin(ean)) }

  // ── cadastro de produto (idempotente por EAN) ───────────────────────────────
  /**
   * p = { codigoBarras, nome, precoReferencia, categoria?, codigoVenda?, unidade?, ncm?,
   *       cest?, restritoIdade?, autoatendimento?=true, imagemUrl? | imagem?{data} }
   * Já existe → não recria; atualizar=true aplica nome/preço/flags/classe (foto só se o
   * Beepay estiver sem). Novo sem codigoVenda → próximo código livre a partir de
   * codigoVendaMin. Classe = categoria (mesmo nome do grupo), gravada em txtClassesLote.
   * @returns {{acao:'criado'|'existente'|'atualizado', produto, avisos:string[]}}
   */
  async cadastrarProduto(p, { atualizar = false, codigoVendaMin = 1 } = {}) {
    const ean = soDigitos(p.codigoBarras)
    if (![8, 12, 13, 14].includes(ean.length)) throw new BeepayErro(`EAN inválido: ${p.codigoBarras}`)
    return this.#comSessao(async () => {
      const g = await this.#gtin(ean)
      const atual = mapGtin(ean, g)
      if (atual) {
        if (!atualizar) return { acao: 'existente', produto: atual, avisos: [] }
        const avisos = await this.#salvarEdicao(await this.#abrirEdicao(atual), p, ean, { atualizar: true, prod: atual })
        return { acao: 'atualizado', produto: atual, avisos }
      }
      if (!(Number(p.precoReferencia) > 0)) throw new BeepayErro(`${ean}: sem preço`)
      const codigoVenda = p.codigoVenda ?? await this.#proximoCodigoVenda(codigoVendaMin)
      const edicao = await this.#cadastroRapido({ ...p, codigoVenda }, ean, g)
      const novo = mapGtin(ean, await this.#gtin(ean))
      // incerto: o produto pode ter sido criado sem aparecer no GTIN → NÃO repetir sozinho
      if (!novo) throw new BeepayIncerto(`${ean}: cadastro (cód ${codigoVenda}) não confirmou no GetProdutoGTIN${mensagemDe(edicao.html) ? ` — ${mensagemDe(edicao.html)}` : ''} — conferir no painel antes de reenviar`)
      const tela = edicao.has('ddlMaior18') ? edicao : await this.#abrirEdicao(novo)
      const avisos = await this.#salvarEdicao(tela, p, ean, { atualizar: false, prod: novo })
      if (novo.codigoVenda !== String(codigoVenda)) avisos.push(`CodigoVenda ${novo.codigoVenda} ≠ pedido ${codigoVenda}`)
      return { acao: 'criado', produto: novo, avisos }
    })
  }

  // filtro da lista SEMPRE com consulta nova e os outros filtros limpos: o filtro fica na
  // sessão (nome preso de uma busca anterior escondia o código) e "Todos" inclui desativados
  async #filtrar(cod) {
    const lista = await this.#get('produtos', 'lista')
    lista.set('txtCodFiltro', String(cod))
    if (lista.has('txtNomeFiltro')) lista.set('txtNomeFiltro', '')
    if (lista.has('ddlstatusfiltro') && lista.options('ddlstatusfiltro').some(o => o.value === 'T')) lista.set('ddlstatusfiltro', 'T')
    const res = await this.#acionar(lista, 'btnFiltrarC', {}, `filtro-${cod}`)
    // prova de que o filtro foi aplicado (senão uma página de erro "sem linhas" passaria
    // por código livre): o campo volta com o código e a grade (ou o aviso de vazia) existe
    const ecoou = res.has('txtCodFiltro') && String(res.get('txtCodFiltro') ?? '') === String(cod)
    const temGrade = /<table\b[^>]*id="[^"]*gdv"/i.test(res.html) || /Nenhum (registro|produto)/i.test(textOf(semScripts(res.html)))
    if (!ecoou || !temGrade) throw new BeepayErro(`filtro da lista (cód ${cod}) não confirmou — página inesperada`)
    return { res, linhas: semScripts(res.html).split(/<tr\b/i).filter(t => /\$imgEditar"/i.test(t)) }
  }

  // código de venda livre (o "sugerido" da tela é um EAN, não serve): sobe a partir da dica
  async #proximoCodigoVenda(min) {
    for (let c = Math.max(1, Number(min) || 1), n = 0; n < 50; c++, n++)
      if (!(await this.#filtrar(c)).linhas.length) return c
    throw new BeepayErro(`nenhum código de venda livre entre ${min} e ${Number(min) + 49} — ajustar a dica`)
  }

  // nome da classe (normalizado) → código (classe-produtos), cache por instância
  #classes = null
  async #mapaClasses() {
    if (!this.#classes) {
      const g = lerGrade((await this.#get('classe-produtos', 'classes')).html, 'gdv')
      this.#classes = new Map(g.linhas.map(l => [normNome(l['Descrição']), String(l['Código'] || '').trim()]).filter(([n, c]) => n && /^\d+$/.test(c)))
    }
    return this.#classes
  }

  async #cadastroRapido(p, ean, gtin) {
    const f = await this.#get('produtos', 'produtos')
    const rx = (s) => new RegExp(`(?:^|\\$)txt\\w*${s}\\w*Rapido$`, 'i')
    f.set(rx('(?:GTIN|EAN)'), ean)
    f.set('txtDescrCupomRapido', String(p.nome).trim().slice(0, 100)) // txtdescrcupom tem max 100
    f.set('txtCodVendaRapido', String(p.codigoVenda))
    f.set('txtValorRapido', brl(p.precoReferencia))
    const ncm = soDigitos(p.ncm || gtin?.NCM), cest = soDigitos(p.cest || gtin?.CEST)
    if (ncm) f.set(rx('NCM'), ncm)
    if (cest) f.set(rx('CEST'), cest)
    const grupo = String(p.categoria || 'DIVERSOS').trim().toUpperCase()
    if (!f.selectByText('ddlGrupoRapido', grupo)) { f.set('ddlGrupoRapido', '0'); f.set('txtNovoGrupo', grupo) } // servidor cria o grupo
    if (!f.selectByText('ddlUnidadeRapido', p.unidade || 'UN')) throw new BeepayErro(`unidade ${p.unidade || 'UN'} não existe no Beepay`)
    if (f.has('ddlAcaoGravaRapido')) f.set('ddlAcaoGravaRapido', '1')   // 1 = devolve a tela de edição
    this.log(`cadastro rápido ${ean} cod ${p.codigoVenda} "${p.nome}"`)
    return this.#acionar(f, 'btnGravaRapido', {}, 'grava-rapido')
  }

  // lista de produtos → filtra pelo código → botão editar da linha certa
  async #abrirEdicao(prod) {
    for (const cod of [prod.codigoVenda, prod.externalId, prod.codigoBarras].filter(Boolean)) {
      const { res, linhas } = await this.#filtrar(cod)
      const alvo = linhas.length === 1 ? linhas[0]
        : linhas.find(t => { const tx = ` ${textOf('<tr' + t)} `; return tx.includes(` ${prod.codigoBarras} `) || (prod.nome && tx.includes(prod.nome)) })
      const btn = alvo && alvo.match(/name="([^"]*\$imgEditar)"/i)?.[1]
      if (!btn) continue
      const tela = await this.#post(res, { submitter: btn }, 'editar')
      exigeEan(tela, prod.codigoBarras)
      return tela
    }
    throw new BeepayErro(`produto ${prod.codigoBarras} não achado na lista (filtro txtCodFiltro)`)
  }

  // grava a tela de edição e CONFERE (reabre e compara): +18 sempre; autoatendimento/QR só no
  // cadastro novo (não reativa o que a equipe escondeu); nome/preço na atualização; classe da
  // categoria trocada preservando as manuais; foto só no cadastro novo ou se o Beepay estiver
  // sem. Devolve avisos (não-fatais); campo que não gravou → BeepayErro.
  async #salvarEdicao(tela, p, ean, { atualizar = false, prod } = {}) {
    exigeEan(tela, ean)
    const avisos = [], esperado = {}
    const quer = (campo, valor) => { tela.set(campo, valor); esperado[campo] = String(valor) }
    let f = tela
    const tagImg = f.html.match(/<img\b[^>]*id="[^"]*imgProduto"[^>]*>/i)?.[0] || ''
    const semFoto = !tagImg || /produto-sem-imagem/i.test(tagImg)
    if (!atualizar || semFoto) {
      const img = await carregarImagem(p)
      if (img) { // foto pequena (128x128) e cardápio (800x600); o servidor guarda no estado da tela
        if (f.has('FileUpload1')) f = await this.#acionar(f, 'btnLer', { files: { FileUpload1: img } }, 'img-128')
        if (f.has('FileUpload2')) f = await this.#acionar(f, 'btnLerImg', { files: { FileUpload2: img } }, 'img-800')
      } else if (p.imagemUrl) avisos.push('imagem ignorada (download falhou ou formato não png/jpg/gif)')
    }
    tela = f
    if (!atualizar) { // cadastro novo: aparece no totem/QR (default do Beepay é NÃO)
      const auto = p.autoatendimento !== false ? 'True' : 'False'
      this.#setOpcao(f, 'ddlMesaQRCodeAutoAtendimento', auto); esperado.ddlMesaQRCodeAutoAtendimento = auto
      this.#setOpcao(f, 'ddlautoatendimento', auto); esperado.ddlautoatendimento = auto
    }
    this.#setOpcao(f, 'ddlMaior18', p.restritoIdade ? 'True' : 'False'); esperado.ddlMaior18 = p.restritoIdade ? 'True' : 'False'
    if (atualizar) { // Vallen é mestre do catálogo: nome e preço
      const nome = String(p.nome || '').trim()
      if (nome) for (const [campo, max] of [['txtdescrcupom', 100], ['txtNome', 150], ['txtDescrTabletQrCodeMesa', 150]])
        if (f.has(campo)) quer(campo, nome.slice(0, max))
      if (Number(p.precoReferencia) > 0) {
        const gravados = await this.#precoFiliais(f, p.precoReferencia) // tabela de preços por filial
        if (gravados.length) gravados.forEach(n => { esperado[n] = brl(p.precoReferencia) })
        else if (f.has('txtvalor')) quer('txtvalor', brl(p.precoReferencia))
      }
    }
    // grupo + classe = categoria (mesmo nome). Classe é gravada de txtClassesLote (ddlClasses
    // é só UI). Troca SÓ a classe-de-categoria (nome igual a um grupo); classes manuais ficam.
    // Sem categoria no Vallen: cadastro novo → DIVERSOS; atualização → não mexe.
    const cat = p.categoria || (atualizar ? null : 'DIVERSOS')
    if (cat) {
      const classes = await this.#mapaClasses()
      const classeId = classes.get(normNome(cat))
      const grupoCampo = f.match(/\$ddlGrupo(Produto)?$/i)[0]
      if (!classeId) avisos.push(`classe "${cat}" não existe no Beepay — produto fica fora das categorias do totem`)
      else if (f.has('txtClassesLote')) {
        const deCategoria = new Set((grupoCampo ? f.options(grupoCampo) : []).map(o => classes.get(normNome(o.text))).filter(Boolean))
        const atuais = String(f.field('txtClassesLote').value || '').split(',').map(s => s.trim()).filter(Boolean)
        const nova = [...atuais.filter(id => !deCategoria.has(id) && id !== classeId), classeId].join(',')
        if (nova !== atuais.join(',')) quer('txtClassesLote', nova)
      }
      if (atualizar && grupoCampo && !f.selectByText(grupoCampo, cat)) avisos.push(`grupo "${cat}" não existe no Beepay — grupo mantido`)
    }
    await this.#post(f, { eventTarget: 'ctl00$btnGravar' }, 'gravar')

    // confere: WebForms devolve erro de validação com HTTP 200 → reabrir e comparar
    if (prod) {
      const r = await this.#abrirEdicao(prod)
      const lista = (v) => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean).sort().join(',')
      const falhou = Object.entries(esperado).filter(([campo, v]) => {
        const atual = r.has(campo) ? r.get(campo) ?? r.field(campo).value : undefined
        return campo === 'txtClassesLote' ? lista(atual) !== lista(v) : String(atual ?? '').trim() !== String(v).trim()
      }).map(([campo]) => campo)
      if (falhou.length) throw new BeepayErro(`${ean}: gravação não confirmou (${falhou.join(', ')})`)
    }
    return avisos
  }

  // ── inventário por planilha (Estoque → Inventário, estoque_form.aspx?tela=3) ──
  /**
   * itens = [{ codigo, codigoVenda, produto, grupo?, unidade?, quantidade, custo? }]
   * (codigo = id interno Beepay). Sem `confirmar` só carrega a PRÉVIA (grade gdvItens) e
   * NÃO grava. ⚠️ confirmar trava exclusão de operações anteriores ao inventário.
   */
  async inventario(itens, { filial, confirmar = false } = {}) {
    if (!filial) throw new BeepayErro('inventário: informe a filial (código ou nome; "Todas" só se pedido)')
    const xlsx = planilhaInventario(itens)
    return this.#comSessao(async () => {
      let f = await this.#get('estoque_form.aspx?tela=3', 'inv-tela')
      f = await this.#marcarFilial(f, String(filial))
      const aba = alvoPostBack(f.html, 'lnkImportar') || postBackDe(f.html.match(/<a\b[^>]*>(?=[^<]*Importar\s+Excel)/i)?.[0])?.target
      if (aba) f = await this.#post(f, { eventTarget: aba }, 'inv-aba')   // aba só existe server-side se for LinkButton
      const gatilho = f.has('btnLerXLSInventario') || alvoPostBack(f.html, 'btnLerXLSInventario') ? 'btnLerXLSInventario' : gatilhoDoUpload(f.html)
      if (!gatilho) throw new BeepayErro('inventário: não achei o postback de leitura da planilha (btnLerXLSInventario)')
      f = await this.#acionar(f, gatilho, { files: { FileUpload2: { data: xlsx, filename: 'inventario.xlsx', type: XLSX_MIME } } }, 'inv-upload')
      const previa = lerGrade(f.html, 'gdvItens')
      if (!previa.linhas.length) throw new BeepayErro(`inventário: a planilha não carregou itens na grade${mensagemDe(f.html) ? ` — ${mensagemDe(f.html)}` : ''} (rode com --debug)`)
      if (!confirmar) return { confirmado: false, enviados: itens.length, previa }
      for (const [rx, label] of [[/ciente/i, 'inv-ciente'], [/confirmar\s+opera/i, 'inv-confirmar']]) {
        const c = controlePorTexto(f, rx)
        if (!c) throw new BeepayErro(`inventário: botão ${rx} não encontrado — NADA confirmado`)
        if (c.checkbox) { f.check(c.checkbox); continue }
        f = c.submitter ? await this.#post(f, { submitter: c.submitter }, label) : await this.#post(f, { eventTarget: c.target }, label)
      }
      const numero = textOf(f.html).match(/invent[aá]rio\s*(?:n[ºo°.]*\s*)?(\d{5,})/i)?.[1] || null
      return { confirmado: true, numero, mensagem: mensagemDe(f.html), previa }
    })
  }

  // filial do inventário: select (value/texto) ou checkbox com <label>; exige casamento ÚNICO
  async #marcarFilial(f, filial) {
    const alvo = filial.toUpperCase()
    const sel = f.fields.find(x => x.kind === 'select' && /filia|loja/i.test(x.name) && x.options.some(o => o.value === filial || o.text.toUpperCase().includes(alvo)))
    if (sel) {
      const o = sel.options.find(o => o.value === filial) || sel.options.find(o => o.text.toUpperCase().includes(alvo))
      f.set(sel.name, o.value, { raw: true })
      const pb = postBackDe(sel.attrs.onchange)
      return pb ? this.#post(f, { eventTarget: pb.target }, 'inv-filial') : f
    }
    const labels = Object.fromEntries([...f.html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi)].map(m => [m[1], textOf(m[2])]))
    // qualquer checkbox com rótulo (CheckBoxList de filiais não tem value; o nome vem no <label>)
    const caixas = f.fields.filter(x => x.type === 'checkbox' && (labels[x.attrs.id] || /filia|loja|todas/i.test(x.name)))
      .map(x => ({ ...x, label: labels[x.attrs.id] || '' }))
    const ok = caixas.filter(x => x.value === filial || x.label.toUpperCase() === alvo || (alvo !== 'TODAS' && x.label.toUpperCase().includes(alvo)))
    if (ok.length !== 1) throw new BeepayErro(`inventário: filial "${filial}" casou ${ok.length} opções. Disponíveis: ${caixas.map(x => x.label || x.value).join(' | ') || '(nenhuma)'}`)
    f.check(ok[0].name)
    const pb = postBackDe(ok[0].attrs.onclick)
    return pb ? this.#post(f, { eventTarget: pb.target }, 'inv-filial') : f
  }

  // Preço da TABELA DE PREÇOS por filial (grade GridView2 da edição). A tela grava cada linha
  // via Ajax putValueTabelaPrecos (tabela temporária codTabela) + marca a filial em
  // txtCodLojasAlteradas; o "Gravar" efetiva. Só o campo do form NÃO basta quando a filial já
  // tem preço próprio (visto em 2026-10-22: o preço não mudava). Preço do Vallen é global →
  // grava em todas as filiais da grade. Devolve os names das linhas gravadas.
  async #precoFiliais(f, preco) {
    const tabela = f.has('txtCodTabela') ? String(f.field('txtCodTabela').value || '') : ''
    const linhas = f.fields.filter(x => /\$GridView2\$ctl\d+\$txtvalor$/i.test(x.name))
    if (!tabela || !linhas.length) return []
    const pega = (n) => (f.match(n).length ? String(f.get(n) ?? '') : '')
    let lojas = []
    try { lojas = JSON.parse((f.has('txtCodLojasAlteradas') && f.field('txtCodLojasAlteradas').value) || '[]') } catch { lojas = [] }
    const gravados = []
    for (const l of linhas) {
      // a chamada fica no onblur/onchange (varia) — procura em qualquer atributo do campo
      const m = Object.values(l.attrs).join(' ').match(/changeValue\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
      if (!m) continue
      const [, , codloja, codprod] = m
      const pref = l.name.replace(/txtvalor$/i, '')
      const qs = new URLSearchParams({
        codproduto: codprod, valor: brl(preco), codfilial: codloja, codTabela: tabela,
        grupotributario: pega(pref + 'ddlGrupoTC'), numdias: pega(pref + 'txtDiasReposicoes'),
        estoqueminimo: pega(pref + 'txtEstoqueMinimo'), pausar: String(f.pairs.some(p => p[0] === pref + 'ckbPausar')), telaProdutos: 'true',
      })
      const r = await this.#s.request(`ajax/putValueTabelaPrecos.ashx?${qs}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (ehLogin(r)) throw new BeepaySessaoExpirada('putValueTabelaPrecos')
      if (r.status !== 200 || !(parseInt(r.text, 10) > 0)) throw new BeepayErro(`preço da filial ${codloja} recusado (putValueTabelaPrecos: ${r.text.slice(0, 40) || r.status})`, { status: r.status })
      f.set(l.name, brl(preco), { raw: true })
      if (!lojas.some(x => String(x.CodLoja) === codloja)) lojas.push({ CodLoja: Number(codloja) })
      gravados.push(l.name)
    }
    if (gravados.length && f.has('txtCodLojasAlteradas')) f.set('txtCodLojasAlteradas', JSON.stringify(lojas))
    return gravados
  }

  // diagnóstico: salva as telas-chave + resumo dos campos/postbacks em debugDir
  async recon() {
    return this.#comSessao(async () => {
      const out = {}
      for (const [label, path] of [['produtos', 'produtos'], ['inventario', 'estoque_form.aspx?tela=3']]) {
        const f = await this.#get(path, `recon-${label}`)
        out[label] = {
          url: f.url, action: f.action,
          campos: f.fields.filter(x => !x.name.startsWith('__')).map(x => ({ name: x.name, type: x.type, id: x.attrs.id, opcoes: x.options?.length, postback: postBackDe(x.attrs.onclick || x.attrs.onchange)?.target })),
          linkButtons: [...new Set([...f.html.matchAll(/__doPostBack\(\s*\\?['"]([^'"\\]+)/g)].map(m => m[1]))],
          scriptsUpload: [...f.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => /FileUpload|btnLer|change\(/i.test(s)).map(s => s.trim().slice(0, 1500)),
        }
      }
      return out
    })
  }
}

// planilha no gabarito do Beepay. Quantidade é ABSOLUTA; custo ≤ 0 o Beepay ignora.
export function planilhaInventario(itens) {
  const linhas = [COLUNAS_INVENTARIO]
  for (const i of itens) {
    const q = Number(i.quantidade)
    if (!i.codigo || !Number.isFinite(q) || q < 0) throw new BeepayErro(`item de inventário inválido: ${JSON.stringify(i)}`)
    const custo = Number(i.custo) > 0 ? Math.round(Number(i.custo) * 100) / 100 : 0
    linhas.push([Number(i.codigo), i.codigoVenda != null ? Number(i.codigoVenda) : null, String(i.produto || ''), String(i.grupo || ''), String(i.unidade || 'UN'), q, custo])
  }
  return gerarXlsx(linhas)
}

// tabela de um GridView → { colunas, linhas:[{col: texto}] }
export function lerGrade(html, idSufixo) {
  const t = semScripts(html).match(new RegExp(`<table\\b[^>]*id="[^"]*${idSufixo}"[^>]*>([\\s\\S]*?)</table>`, 'i'))
  if (!t) return { colunas: [], linhas: [] }
  const rows = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map(c => ({ th: c[1].toLowerCase() === 'h', txt: textOf(c[2]) })))
  const head = rows.find(r => r.length && r.every(c => c.th))
  const colunas = head ? head.map(c => c.txt) : []
  const linhas = rows.filter(r => r !== head && r.length > 1 && !r.every(c => c.th))
    .map(r => Object.fromEntries(r.map((c, i) => [colunas[i] || `c${i}`, c.txt])))
  return { colunas, linhas }
}

// o que o change do FileUpload2 dispara (se não for o btnLerXLSInventario conhecido)
function gatilhoDoUpload(html) {
  for (const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const s = m[1].match(/FileUpload2[\s\S]{0,600}?(?:__doPostBack\(\s*['"]([^'"]+)['"]|#(\w*btn\w+)['"]\s*\)\s*\.(?:click|trigger))/i)
    if (s) return s[1] || s[2].replace(/^ContentPlaceHolder1_/, '')
  }
  return null
}

// botão/link/checkbox pelo texto visível (value, conteúdo do <a> ou <label>)
function controlePorTexto(f, rx) {
  const btn = f.fields.find(x => ['submit', 'button'].includes(x.type) && rx.test(x.value))
  if (btn) return btn.type === 'submit' ? { submitter: btn.name } : { target: postBackDe(btn.attrs.onclick)?.target || btn.name }
  for (const m of f.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!rx.test(textOf(m[2]))) continue
    const pb = postBackDe(m[1])
    if (pb) return { target: pb.target }
  }
  for (const m of f.html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi)) {
    const cb = rx.test(textOf(m[2])) && f.fields.find(x => x.type === 'checkbox' && x.attrs.id === m[1])
    if (cb) return { checkbox: cb.name }
  }
  return null
}
