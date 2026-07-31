import { PosConnector } from './PosConnector.js'

// Modo A — ÚNICO lugar que conhece a DigitalWeb (DWPDV/DWOFFICE). Dois transportes:
//
//  (A) API oficial `apidwpdv` — http://www.dwpdv.com.br/apidwpdv (HTTP puro, sem TLS).
//      Só devolve TRANSACIONAL nesta conta (Sales/StockInventories). Products/Companies
//      vêm VAZIOS (provisionamento). Usada p/ pullVendas.
//
//  (B) Sessão do ERP web DWOFFICE — https://www.foodcash.com.br/sistema (HTTPS). É onde
//      está o catálogo real (47k+). Login WebForms (__VIEWSTATE) → cookie de sessão →
//      `pegaritens.aspx` (DataTables server-side, catálogo completo) e handlers .ashx
//      (`PdvBuscarProduto` = lookup por EAN/nome). Usada p/ pullProdutos/buscarPorEan.
//
// ⚠️ (A) trafega senha/CPF em claro (exigir HTTPS antes de prod). (B) submete a senha do
//    ERP no login — guardar como SECRET e TROCAR a senha fraca. Ambos ficam ISOLADOS
//    aqui: o núcleo só fala tipos canônicos, então trocar pro oficial não mexe no resto.

export class PosNaoConfigurado extends Error {}

const API_BASE = process.env.DWPDV_BASE_URL || 'http://www.dwpdv.com.br/apidwpdv'
const ERP_BASE = process.env.DWPDV_ERP_BASE || 'https://www.foodcash.com.br/sistema'

// preço BR ("3,99" | "1.234,56") ou número (16.18) → number, ou NULL se inválido.
// NUNCA devolve 0 em falha de parse: 0 seria empurrado como preço real e zeraria o item.
function precoBR(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : null
}

// EAN normalizado p/ casamento entre fontes (só dígitos, sem zeros à esquerda).
// StockInventories e pegaritens gravam o mesmo produto com 8/13/14 díg → normalizar.
export function normEan(v) {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.replace(/^0+/, '') || d
}

// DWPDV grava data naïve em BRT ("2026-04-13T19:28:24"). Anexa -03:00 p/ não deslocar
// ~3h ao gravar em timestamptz (senão o driver interpreta como UTC).
function brtIso(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  return /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + '-03:00'
}

// número → preço BR "28,90" (o importcadastroproduto.ashx espera vírgula)
function brlFmt(n) { return n == null ? null : Number(n).toFixed(2).replace('.', ',') }

export class DwpdvConnector extends PosConnector {
  get id() { return 'dwpdv' }

  // ── transporte A: API oficial apidwpdv ──────────────────────────────────────
  #matriz  = process.env.DWPDV_MATRIZ
  #user    = process.env.DWPDV_USERNAME
  #pass    = process.env.DWPDV_PASSWORD
  #token   = null
  #tokenExp = 0

  // ── transporte B: sessão do ERP DWOFFICE ────────────────────────────────────
  #erpCnpj = process.env.DWPDV_ERP_CNPJ || process.env.DWPDV_MATRIZ
  #erpUser = process.env.DWPDV_ERP_USER || process.env.DWPDV_USERNAME
  #erpPass = process.env.DWPDV_ERP_PASSWORD || process.env.DWPDV_PASSWORD
  #cookie   = null
  #cookieExp = 0

  #assertApi() {
    if (!this.#matriz || !this.#user || !this.#pass)
      throw new PosNaoConfigurado('DWPDV_MATRIZ/USERNAME/PASSWORD não configurados')
  }

  async #getToken() {
    if (this.#token && Date.now() < this.#tokenExp) return this.#token
    const body = new URLSearchParams({ username: this.#user, password: this.#pass, grant_type: 'password' })
    const r = await fetch(`${API_BASE}/token`, { method: 'POST', body })
    if (!r.ok) throw new Error(`DWPDV token: HTTP ${r.status}`)
    const d = await r.json()
    this.#token = d.access_token
    this.#tokenExp = Date.now() + (Math.max(60, (d.expires_in || 3600) - 60)) * 1000
    return this.#token
  }

  async #apiGet(path, extra = {}) {
    this.#assertApi()
    const tk = await this.#getToken()
    const qs = new URLSearchParams({ matriz: this.#matriz, ...extra })
    const r = await fetch(`${API_BASE}${path}?${qs}`, { headers: { Authorization: `Bearer ${tk}` } })
    if (!r.ok) throw new Error(`DWPDV GET ${path}: HTTP ${r.status}`)
    const txt = await r.text()
    return txt && txt !== 'null' ? JSON.parse(txt) : []
  }

  // ── transporte B: login WebForms + fetch com cookie ─────────────────────────
  #assertErp() {
    if (!this.#erpCnpj || !this.#erpUser || !this.#erpPass)
      throw new PosNaoConfigurado('DWPDV_ERP_CNPJ/USER/PASSWORD não configurados')
  }

  async #erpLogin() {
    this.#assertErp()
    // 1) GET do form de login (sem cookie) p/ extrair __VIEWSTATE e hiddens
    const html = await fetch(`${ERP_BASE}/`, { credentials: 'omit' }).then(r => r.text())
    const val = (name) => (html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1] || ''
    const form = new URLSearchParams()
    form.set('__EVENTTARGET', 'ImageButton1')   // botão "Sim, concordo" (LinkButton/ImageButton)
    form.set('__EVENTARGUMENT', '')
    form.set('__LASTFOCUS', '')
    form.set('__VIEWSTATE', val('__VIEWSTATE'))
    form.set('__VIEWSTATEGENERATOR', val('__VIEWSTATEGENERATOR'))
    form.set('TextBox0', this.#erpCnpj)   // CNPJ
    form.set('TextBox1', this.#erpUser)   // e-mail/usuário
    form.set('TextBox2', this.#erpPass)   // senha
    for (const h of ['HiddenField1', 'HiddenFieldRepre', 'HiddenFieldLink', 'HiddenSoluveo', 'HiddenFieldBlock'])
      form.set(h, val(h))
    // 2) POST no /sistema/ (redirect manual p/ capturar Set-Cookie do 302 de sucesso)
    const r = await fetch(`${ERP_BASE}/`, {
      method: 'POST', redirect: 'manual', credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    })
    const set = typeof r.headers.getSetCookie === 'function'
      ? r.headers.getSetCookie()
      : [r.headers.get('set-cookie')].filter(Boolean)
    const cookie = set.map(c => c.split(';')[0]).filter(c => /=/.test(c)).join('; ')
    if (!cookie) throw new Error('DWPDV ERP login: sem cookie de sessão (credenciais/CNPJ?)')
    this.#cookie = cookie
    this.#cookieExp = Date.now() + 20 * 60 * 1000 // renova bem antes do timeout de sessão
    return cookie
  }

  async #erpGet(path, { json = true } = {}) {
    if (!this.#cookie || Date.now() > this.#cookieExp) await this.#erpLogin()
    const url = path.startsWith('http') ? path : `${ERP_BASE}/${path.replace(/^\//, '')}`
    const doFetch = () => fetch(url, { headers: { Cookie: this.#cookie }, redirect: 'manual' })
    let r = await doFetch()
    if (r.status === 302 || r.status === 401) { await this.#erpLogin(); r = await doFetch() } // sessão expirou
    if (r.status !== 200) throw new Error(`DWPDV ERP GET ${path}: HTTP ${r.status}`)
    return json ? r.json() : r.text()
  }

  // uma página do catálogo (DataTables LEGADO server-side: iDisplayStart/iDisplayLength)
  async #pegarItens(start, len) {
    const p = new URLSearchParams()
    p.set('sEcho', '1'); p.set('iColumns', '9'); p.set('sColumns', ',,,,,,,,')
    p.set('iDisplayStart', String(start)); p.set('iDisplayLength', String(len))
    for (let i = 0; i < 9; i++) {
      p.set('mDataProp_' + i, i < 8 ? String(i) : '')
      p.set('sSearch_' + i, ''); p.set('bRegex_' + i, 'false')
      p.set('bSearchable_' + i, 'true'); p.set('bSortable_' + i, 'true')
    }
    p.set('sSearch', ''); p.set('bRegex', 'false')
    p.set('iSortCol_0', '3'); p.set('sSortDir_0', 'asc'); p.set('iSortingCols', '1')
    return this.#erpGet(`pegaritens.aspx?${p}`)
  }

  // linha do pegaritens: [indice, EAN, estoque, nome, preco, grupo, categoria, matriz]
  #mapItemRow(row) {
    return {
      codigoBarras: String(row[1] ?? '').trim(),
      nome: String(row[3] ?? '').trim(),
      precoReferencia: precoBR(row[4]),
      categoria: (String(row[5] ?? '').trim()) || undefined,
      estoqueDeposito: Number.parseInt(row[2], 10) || 0,
      externalId: row[0] ? String(row[0]) : undefined,
      ativo: true,
    }
  }

  // ── leitura canônica ────────────────────────────────────────────────────────
  // Catálogo COMPLETO via ERP (páginas de pageSize). onPage(rows) p/ streaming (evita
  // segurar 47k em memória). Sem onPage devolve o array inteiro.
  async pullProdutos(_since, { onPage, pageSize = 2000, max = Infinity } = {}) {
    const first = await this.#pegarItens(0, pageSize)
    const total = Math.min(Number(first.iTotalRecords) || 0, max)
    const out = []
    const emit = (rows) => {
      const mapped = (rows || []).map(r => this.#mapItemRow(r)).filter(p => p.codigoBarras)
      if (onPage) return onPage(mapped)
      out.push(...mapped)
    }
    await emit(first.aaData)
    for (let start = pageSize; start < total; start += pageSize) {
      const pg = await this.#pegarItens(start, Math.min(pageSize, total - start))
      await emit(pg.aaData)
    }
    return onPage ? { total } : out
  }

  // lookup on-demand por código de barras (Scan & Go) — 1 produto ou null
  async buscarPorEan(ean) {
    const r = await this.#erpGet(`api/PdvBuscarProduto.ashx?term=${encodeURIComponent(ean)}`)
    const items = r.items || []
    const it = items.find(x => String(x.codigo) === String(ean)) || items[0]
    if (!it) return null
    return {
      codigoBarras: String(it.codigo).trim(),
      nome: it.nome,
      precoReferencia: precoBR(it.precovenda),
      categoria: it.subgrupo || undefined,
      imagemUrl: it.imageUrl || undefined,
      ativo: true,
    }
  }

  // ── ESCRITA de catálogo: Vallen empurra produto → DWPDV (via sessão do ERP) ──
  // Contrato capturado ao vivo: POST /sistema/importcadastroproduto.ashx
  //   corpo = { mode:"upsert", dryRun:bool, items:[<produto>] }
  async #erpPost(path, body) {
    if (!this.#cookie || Date.now() > this.#cookieExp) await this.#erpLogin()
    const url = path.startsWith('http') ? path : `${ERP_BASE}/${path.replace(/^\//, '')}`
    const doFetch = () => fetch(url, {
      method: 'POST', redirect: 'manual',
      headers: { Cookie: this.#cookie, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    })
    let r = await doFetch()
    if (r.status === 302 || r.status === 401) { await this.#erpLogin(); r = await doFetch() } // sessão expirou
    if (r.status !== 200) throw new Error(`DWPDV ERP POST ${path}: HTTP ${r.status}`)
    const t = await r.text()
    try { return JSON.parse(t) } catch { return t }
  }

  // canônico Vallen → item do importcadastroproduto.ashx (nomes REAIS do handler).
  // NB: fiscais (g3=CFOP, class=CSOSN, ncm, pis, cofins) usam default de revenda;
  // rever se não quiser sobrescrever o fiscal do DWPDV no upsert.
  #mapProdutoPush(p) {
    // Vallen é mestre do CATÁLOGO (nome/preço/visibilidade), NÃO do fiscal. OMITE
    // CFOP(g3)/CSOSN(class)/NCM/precocompra → no upsert o DWPDV preserva o fiscal
    // existente (a contabilidade define lá). ⚠️ CONFIRMAR que o handler mantém campos
    // AUSENTES no upsert (não os zera) — teste pendente. Nunca sobrescrever fiscal.
    return {
      codigo: String(p.codigoBarras || '').trim(),
      codref: p.codref ?? null,
      nome: p.nome,
      estoque: p.estoqueDeposito != null ? String(p.estoqueDeposito) : null,
      univend: p.unidade || 'UN',
      grupo: p.categoria || null,
      subgrupo: p.categoria || null,
      precovenda: brlFmt(p.precoReferencia),
      // op2 = "Visualizar no autoatendimento" no DWPDV. Regra: TODO produto cadastrado
      // no Vallen é exposto no PDV → op2 = "1" sempre.
      op2: '1',
    }
  }

  // push (upsert) de produtos p/ o DWPDV. dryRun=true valida sem gravar.
  // Retorna { ok, inserted, updated, deleted, total, message }.
  async pushProdutos(produtos, { dryRun = false, mode = 'upsert' } = {}) {
    const items = (Array.isArray(produtos) ? produtos : [produtos]).map(p => this.#mapProdutoPush(p))
    return this.#erpPost('importcadastroproduto.ashx', { mode, dryRun, items })
  }

  async pullCategorias() {
    const r = await this.#erpGet('api/PdvCategorias.ashx')
    return (r.items || []).map(c => ({ nome: c.nome, externalId: c.slug || undefined }))
  }

  async pullVendas()      { return this.#apiGet('/api/Sales') } // transacional funciona na API

  // EANs efetivamente movimentados/vendidos (StockInventories) → marca "catálogo ativo"
  // (listado/destaque) vs "base de consulta" (só resolve no scan). Via API oficial.
  async pullCodigosVendidos() {
    const mov = await this.#apiGet('/api/StockInventories')
    return [...new Set((mov || []).map(m => String(m.codigo || '').trim()).filter(Boolean))]
  }

  // Vendas do DWPDV COM itens (p/ importar/consolidar no Vallen). Os itens vivem no
  // StockInventories (casados por `codigovenda`). NÃO devolve CPF (LGPD).
  async pullVendasComItens() {
    const [sales, stock] = await Promise.all([this.#apiGet('/api/Sales'), this.#apiGet('/api/StockInventories')])
    const ms = (d) => { const t = Date.parse(String(d || '')); return Number.isNaN(t) ? 0 : t }
    // movimentos e vendas agrupados por codigovenda (que REPETE entre PDVs — não é único)
    const movPorCV = new Map(), salesPorCV = new Map()
    for (const m of stock || []) { const cv = String(m.codigovenda || ''); if (!cv) continue; (movPorCV.get(cv) || movPorCV.set(cv, []).get(cv)).push(m) }
    for (const s of sales || []) { const cv = String(s.codigovenda || ''); (salesPorCV.get(cv) || salesPorCV.set(cv, []).get(cv)).push(s) }

    return (sales || []).map(s => {
      const cv = String(s.codigovenda || '')
      const irmas = salesPorCV.get(cv) || [s]           // vendas com o MESMO codigovenda
      let movs = movPorCV.get(cv) || []
      if (irmas.length > 1) {
        // codigovenda repetido (PDVs diferentes) → cada item vai p/ a venda de data + próxima
        movs = movs.filter(m => {
          let best = irmas[0], bestD = Infinity
          for (const v of irmas) { const d = Math.abs(ms(m.data) - ms(v.data)); if (d < bestD) { bestD = d; best = v } }
          return String(best.indice) === String(s.indice)
        })
      }
      // agrega itens por codigo somando qtd; pdv = destino do movimento
      const itensMap = new Map()
      for (const m of movs) {
        const cod = String(m.codigo || '').trim()
        const q = Number(String(m.quantidade ?? '0').replace(',', '.')) || 0
        const ex = itensMap.get(cod)
        if (ex) ex.quantidade += q
        else itensMap.set(cod, { codigoBarras: cod, descricao: m.descricao || null, quantidade: q, preco: precoBR(m.preco), pdv: m.destino != null ? String(m.destino) : null })
      }
      const itens = [...itensMap.values()]
      const st = Number.parseInt(s.status, 10)
      return {
        externalId: String(s.indice),                   // CHAVE ÚNICA GLOBAL (indice, não codigovenda)
        codigovenda: cv,
        pdv: itens.find(i => i.pdv)?.pdv ?? null,        // PDV (destino) inferido dos itens
        data: brtIso(s.data),
        total: precoBR(s.valortotalreal),
        recebido: precoBR(s.valorrecebido),
        canal: s.canaldevenda || null,
        status: Number.isNaN(st) ? null : st,
        formaPagamento: {
          dinheiro: precoBR(s.emdinheiro), cartao: precoBR(s.emcartao), cheque: precoBR(s.emcheque),
          ticket: precoBR(s.emticket), redeshop: precoBR(s.emredeshop), moedadigital: precoBR(s.emmoedadigital),
        },
        itens,
      }
    }).filter(v => v.externalId)
  }
  async pullCompanies()   { return (await this.#apiGet('/api/Companies', { token: await this.#getToken() })).map(c => ({ cnpj: String(c.cnpj || c.matriz || '').replace(/\D/g, ''), nome: c.nome, isMatriz: false })) }
  async pullClientes(doc) { return this.#apiGet('/byCPFCNPJ', { cpf: doc }) } // on-demand (LGPD)

  // push da venda p/ o frente de caixa (HUB). Payload EXATO a confirmar com a doc/testes.
  async pushVenda(venda) {
    this.#assertApi()
    const tk = await this.#getToken()
    const qs = new URLSearchParams({ matriz: this.#matriz })
    const r = await fetch(`${API_BASE}/api/HUB?${qs}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(venda), // TODO: mapear p/ o shape do HUB (EAN vs indiceweb)
    })
    if (!r.ok) throw new Error(`DWPDV HUB: HTTP ${r.status}`)
    return { externalId: undefined }
  }

  // Modo A: estoque é do PDV → NÃO baixa local; enfileira p/ o HUB.
  async reservaEstoqueLocal() { /* no-op: DWPDV é dono do estoque */ }
  async enfileirarVenda(supabase, venda) {
    await supabase.schema('integracao').from('venda_outbox')
      .upsert({ pedido_id: venda.pedidoId, unidade_id: venda.unidadeId, payload: venda, status: 'pendente' },
              { onConflict: 'pedido_id' })
  }

  // TODO Fase 3: traduzir o payload do webhook de estoque → CanonEstoqueEvt[]
  parseWebhookEstoque(payload) { return [] }
}
