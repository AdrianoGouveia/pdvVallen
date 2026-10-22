// Vendas Vallen ⇄ Beepay — núcleo dos crons (api/cron/*-vendas-beepay.js) e do CLI.
// Tabelas: migration 20261017000001_vendas_beepay.sql (schema integracao).
//
// PUSH (Vallen → Beepay): drena integracao.venda_beepay_outbox via cupom/save.
//   • conta não pronta (sem API/usuário/terminal) → não toca em nada, só reporta.
//   • falta forma de pagamento / produto sem código → fica 'pendente' + `aguardando`.
//   • rejeição 4xx (ou falha antes de enviar) → volta p/ 'pendente' (até MAX_TENT).
//   • 5xx / rede / timeout / envio travado → 'erro' p/ conferência MANUAL: o cupom pode
//     ter sido gravado e reenviar sozinho poderia duplicar a venda no Beepay.
// PULL (Beepay → Vallen): cupom/get (janelas ≤ 10 dias) → importar_vendas_beepay,
//   pulando os cupons que nós mesmos mandamos (não conta venda 2x no relatório).
import { contaBeepayDoEnv } from '../BeepayConnector.js'
import { montarCupom } from './BeepayApi.js'
import { BeepayAguardandoConfig, BeepayErro } from './erros.js'

const MAX_TENT = 5
const TRAVADO_MS = 15 * 60_000
const r2 = (n) => Math.round(Number(n) * 100) / 100
const agora = () => new Date().toISOString()
const semZeros = (e) => String(e || '').replace(/\D/g, '').replace(/^0+/, '')
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const hojeBrt = (desloc = 0) => new Date(Date.now() - 3 * 3600_000 + desloc * 86400_000).toISOString().slice(0, 10)
const brt = (s) => (!s ? null : /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}-03:00`)

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** provider/tipo do pedido Vallen → forma canônica do cupom. Maquininha sem tipo
 *  conhecido vira 'desconhecida' (a venda espera) em vez de chutar crédito. */
export function pagamentoDe(pd) {
  const prov = String(pd.provider || ''), tipo = semAcento(pd.tipo_cartao), band = semAcento(pd.bandeira)
  const base = { gateway: prov, nsu: pd.nsu || undefined }
  if (/pix|asaas/i.test(prov) || tipo.includes('pix') || band.includes('pix'))
    return { ...base, forma: 'pix', idTransacao: pd.efi_txid || pd.asaas_id || undefined }
  const forma = tipo.includes('deb') ? 'debito' : tipo.includes('cred') || /cartao/i.test(prov) ? 'credito' : 'desconhecida'
  return { ...base, forma, bandeira: pd.bandeira || undefined, idTransacao: pd.efi_charge_id ? String(pd.efi_charge_id) : undefined }
}

// ── cache EAN ↔ código interno Beepay (integracao.beepay_produto) ──────────────
// O que falta resolve pela API (produtos/get, 1 chamada) ou, sem API, pelo painel (GTIN).
async function codigosPorEan(sb, pos, eans, prazo) {
  const tab = () => sb.schema('integracao').from('beepay_produto')
  const mapa = new Map()
  const uniq = [...new Set(eans.filter(Boolean))]
  for (const c of chunks(uniq, 200)) {
    const { data, error } = await tab().select('codigo_barras,codigo,codigo_venda,nome').in('codigo_barras', c)
    if (error) throw new Error(`beepay_produto: ${error.message}`)
    data.forEach(r => mapa.set(r.codigo_barras, r))
  }
  const faltam = uniq.filter(e => !mapa.has(e))
  if (!faltam.length) return mapa
  const novos = []
  if (pos.api.configurado) {
    const porEan = new Map()
    for (const p of await pos.api.listarProdutos()) if (p.codigo && p.codigoEAN) porEan.set(semZeros(p.codigoEAN), p)
    for (const e of faltam) {
      const p = porEan.get(semZeros(e))
      if (p) novos.push({ codigo_barras: e, codigo: p.codigo, codigo_venda: p.codigoVenda, nome: p.nome })
    }
  } else if (pos.web.configurado) {
    for (const e of faltam) {
      if (Date.now() > prazo) break
      const b = await pos.web.buscarPorEan(e)
      if (b?.externalId) novos.push({ codigo_barras: e, codigo: b.externalId, codigo_venda: b.codigoVenda ?? null, nome: b.nome ?? null })
    }
  }
  if (novos.length) {
    const { error } = await tab().upsert(novos.map(n => ({ ...n, atualizado_em: agora() })), { onConflict: 'codigo_barras' })
    if (error) throw new Error(`beepay_produto upsert: ${error.message}`)
    novos.forEach(n => mapa.set(n.codigo_barras, n))
  }
  return mapa
}

// código interno → EAN (itens do cupom do PDV trazem só codproduto). Sem achar → null.
async function eansPorCodigo(sb, pos, codigos) {
  const tab = () => sb.schema('integracao').from('beepay_produto')
  const mapa = new Map()
  const uniq = [...new Set(codigos.filter(c => c != null).map(String))]
  for (const c of chunks(uniq, 200)) {
    const { data, error } = await tab().select('codigo_barras,codigo').in('codigo', c)
    if (error) throw new Error(`beepay_produto: ${error.message}`)
    data.forEach(r => mapa.set(String(r.codigo), r.codigo_barras))
  }
  for (const c of uniq.filter(x => !mapa.has(x))) {
    const p = await pos.api.produtoPorCodigo(c).catch(() => null)
    if (!p?.codigoEAN) continue
    mapa.set(c, p.codigoEAN)
    await tab().upsert({ codigo_barras: p.codigoEAN, codigo: c, codigo_venda: p.codigoVenda, nome: p.nome, atualizado_em: agora() }, { onConflict: 'codigo_barras' })
  }
  return mapa
}

// ── PUSH ──────────────────────────────────────────────────────────────────────
export async function drenarVendasBeepay(sb, pos, { limite = 20, prazoMs = 8000, dry = false, conta = contaBeepayDoEnv(), log = () => {},
  carenciaMin = Number(process.env.BEEPAY_VENDA_CARENCIA_MIN ?? 10) } = {}) {
  const prazo = Date.now() + prazoMs
  const ob = () => sb.schema('integracao').from('venda_beepay_outbox')
  const falta = [
    !pos.api.configurado && 'credencial da API (BEEPAY_CLIENT_ID/BEEPAY_CLIENT_SECRET)',
    !conta.usuario && 'BEEPAY_USUARIO', !conta.terminal && 'BEEPAY_TERMINAL',
    conta.emitirNfce && 'BEEPAY_EMITIR_NFCE=true (emissão não implementada)',
  ].filter(Boolean)
  if (falta.length && !dry) {
    const { count } = await ob().select('pedido_id', { count: 'exact', head: true }).eq('status', 'pendente')
    return { ok: false, aguardando: falta, pendentes: count ?? null } // nada foi tocado
  }

  // envio que ficou 'enviando' (worker morreu no meio) → conferência manual, sem reenviar
  if (!dry) await ob().update({ status: 'erro', updated_at: agora(), erro: 'envio interrompido: resultado incerto — conferir no Beepay (cupom/get) antes de voltar p/ pendente' })
    .eq('status', 'enviando').lt('updated_at', new Date(Date.now() - TRAVADO_MS).toISOString())

  // fila por updated_at: quem fica esperando config vai p/ o fim (não trava a fila).
  // Carência: pedido recém-enfileirado espera (o status pode virar recusado/estornado
  // logo depois — ex.: INSERT já 'aprovado' pelo default antes do resultado do cartão).
  const carencia = new Date(Date.now() - carenciaMin * 60_000).toISOString()
  const { data: fila, error } = await ob().select('pedido_id,unidade_id,cod_filial,tentativas')
    .eq('status', 'pendente').lt('created_at', carencia).order('updated_at').limit(limite)
  if (error) throw new Error(`venda_beepay_outbox: ${error.message}`)
  const res = { ok: true, fila: fila.length, enviados: 0, aguardando: 0, reenfileirados: 0, erros: 0, ignorados: 0 }
  if (!fila.length) return res

  const ids = fila.map(f => f.pedido_id)
  const { data: pedidos, error: e1 } = await sb.from('pedidos')
    .select('id,total,status,created_at,provider,unidade_id,nsu,bandeira,tipo_cartao,efi_txid,efi_charge_id,asaas_id').in('id', ids)
  if (e1) throw e1
  // paginado: PostgREST corta em 1000 linhas e um corte mandaria cupom com itens faltando
  const itens = []
  for (let from = 0; ; from += 1000) {
    const { data, error: e2 } = await sb.from('itens_pedido')
      .select('id,pedido_id,quantidade,preco_unitario,produtos(codigo_barras,nome,preco_custo)').in('pedido_id', ids).order('id').range(from, from + 999)
    if (e2) throw e2
    itens.push(...data); if (data.length < 1000) break
  }
  const { data: filiais, error: e3 } = await sb.schema('integracao').from('beepay_filial').select('cod_filial,unidade_id,ativo')
  if (e3) throw new Error(`beepay_filial: ${e3.message}`)
  const filialDa = new Map(filiais.map(f => [f.unidade_id, f]))
  const porId = new Map(pedidos.map(p => [p.id, p]))
  const codigos = await codigosPorEan(sb, pos, itens.map(i => i.produtos?.codigo_barras), prazo)

  const marca = (id, campos, soSe = 'pendente') => ob().update({ ...campos, updated_at: agora() }).eq('pedido_id', id).eq('status', soSe)
  for (const o of fila) {
    if (Date.now() > prazo) break
    const pd = porId.get(o.pedido_id)
    // estornado/cancelado antes de subir → não registra; unidade trocada → nunca vai p/ outro CNPJ
    if (!pd || pd.status !== 'aprovado') { res.ignorados++; if (!dry) await marca(o.pedido_id, { status: 'ignorado', erro: `pedido ${pd ? `status ${pd.status}` : 'inexistente'}` }); continue }
    if (pd.unidade_id !== o.unidade_id) { res.erros++; if (!dry) await marca(o.pedido_id, { status: 'erro', erro: `unidade do pedido mudou (${o.unidade_id}→${pd.unidade_id})` }); continue }
    // filial conferida NA HORA do envio: mapa desligado → espera; remapeado → nunca manda p/ o CNPJ antigo
    const f = filialDa.get(o.unidade_id)
    if (!f?.ativo) { res.aguardando++; if (!dry) await marca(o.pedido_id, { aguardando: `filial da unidade ${o.unidade_id} desativada/sem mapa em beepay_filial` }); continue }
    if (f.cod_filial !== o.cod_filial) { res.erros++; if (!dry) await marca(o.pedido_id, { status: 'erro', erro: `mapa de filial mudou (${o.cod_filial}→${f.cod_filial}) — conferir antes de reenviar` }); continue }
    const venda = {
      pedidoId: pd.id, unidadeId: pd.unidade_id, total: Number(pd.total), ocorridoEm: pd.created_at, pagamento: pagamentoDe(pd),
      itens: itens.filter(i => i.pedido_id === pd.id).map(i => {
        const c = codigos.get(i.produtos?.codigo_barras)
        return { codigoBarras: i.produtos?.codigo_barras, nome: c?.nome || i.produtos?.nome, quantidade: i.quantidade, precoUnitario: Number(i.preco_unitario), custo: i.produtos?.preco_custo, beepayCodigo: c?.codigo, beepayCodigoVenda: c?.codigo_venda }
      }),
    }
    const c = { ...conta, filial: o.cod_filial }
    let cupom
    try { cupom = montarCupom(venda, c) } catch (e) {
      if (e instanceof BeepayAguardandoConfig) { res.aguardando++; if (!dry) await marca(o.pedido_id, { aguardando: e.message }); continue }
      res.erros++; if (!dry) await marca(o.pedido_id, { status: 'erro', erro: e.message.slice(0, 500) }); continue
    }
    if (dry) { res.amostra ??= cupom; continue }

    const { data: reservado } = await marca(o.pedido_id, { status: 'enviando', aguardando: null, cupom }).select('pedido_id')
    if (!reservado?.length) continue // outro worker pegou
    const tent = o.tentativas + 1
    try {
      const resp = await pos.registrarVenda(venda, c)
      // 2xx com texto de erro (o endpoint devolve string): formato não confirmado →
      // AMBÍGUO (Error comum) → conferência manual, nunca reenvio automático
      if (typeof resp === 'string' && /\b(erro|error|falha|exception|inv[aá]lid)/i.test(resp))
        throw new Error(`cupom/save respondeu 2xx com: ${resp.slice(0, 200)}`)
      await marca(o.pedido_id, { status: 'enviado', sent_at: agora(), tentativas: tent, resposta: resp ?? null, erro: null }, 'enviando')
      res.enviados++; log(`venda ${o.pedido_id} → Beepay ok`)
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 450)
      const rejeitado = e instanceof BeepayErro && (!e.status || e.status < 500) // 4xx ou antes de enviar
      if (rejeitado && tent < MAX_TENT) { res.reenfileirados++; await marca(o.pedido_id, { status: 'pendente', tentativas: tent, erro: msg }, 'enviando') }
      else { res.erros++; await marca(o.pedido_id, { status: 'erro', tentativas: tent, erro: rejeitado ? msg : `resultado incerto (${msg}) — conferir no Beepay antes de reenviar` }, 'enviando') }
      log(`venda ${o.pedido_id} ✗ ${msg}`)
    }
  }
  return res
}

// ── PULL ──────────────────────────────────────────────────────────────────────
export function mapCupom(c, eanDe) {
  const id = c.codcupom ? String(c.codcupom) : `${c.loja_id}:${c.terminal_id}:${c.venda_id}`
  const forma = {}
  for (const f of c.formaPgtos || []) {
    const k = String(f.nome || f.nomeExterno || `forma_${f.codformarecebimentopdv}`).trim()
    forma[k] = r2((forma[k] || 0) + Number(f.valortotal || 0))
  }
  return {
    venda_id: `beepay:${id}`, cod_filial: String(c.loja_id), codigovenda: String(c.venda_id_pdv ?? c.venda_id ?? ''),
    pdv: c.terminal_id ? String(c.terminal_id) : null, data: brt(c.dtrecebimento || c.dtmovimento),
    total: r2(c.valortotal), recebido: r2(Object.values(forma).reduce((s, v) => s + v, 0)),
    canal: c.tipovenda || 'PDV', forma_pagamento: forma, status: 1,
    cancelado: !!(c.iscancelado || c.isestornado),
    itens: (c.itens || []).filter(i => !i.iscancelado).map(i => {
      const q = Number(i.quantidade) || 0
      return { codigo_barras: eanDe(i.codproduto), descricao: i.nomeProduto || null, quantidade: q, preco: q ? r2(Number(i.valortotal) / q) : r2(i.valortotal), pdv: c.terminal_id ? String(c.terminal_id) : null }
    }),
  }
}

// default: últimos 10 dias (1 janela) → re-sync pega estornos de até ~10 dias
export async function importarCuponsBeepay(sb, pos, { desde = hojeBrt(-9), ate = hojeBrt(), dry = false, conta = contaBeepayDoEnv(), log = () => {} } = {}) {
  if (!pos.api.configurado) return { ok: false, aguardando: ['credencial da API (BEEPAY_CLIENT_ID/BEEPAY_CLIENT_SECRET)'] }
  if (!/^\d{4}-\d\d-\d\d$/.test(desde) || !/^\d{4}-\d\d-\d\d$/.test(ate) || desde > ate) throw new Error(`período inválido ${desde}..${ate}`)
  const integ = () => sb.schema('integracao')
  const { data: fil, error } = await integ().from('beepay_filial').select('cod_filial').eq('ativo', true)
  if (error) throw new Error(`beepay_filial: ${error.message}`)
  if (!fil.length) return { ok: false, aguardando: ['nenhuma filial mapeada em integracao.beepay_filial'] }
  const filiais = fil.map(f => f.cod_filial).join(',')

  // os nossos: pedidos que ESTE worker já mandou (casados pelo terminal do app)
  // paginado: o PostgREST corta em 1000 linhas e um corte silencioso contaria venda 2x
  const enviados = new Set()
  const corte = new Date(Date.parse(`${desde}T03:00:00Z`) - 2 * 86400_000).toISOString()
  for (let from = 0; ; from += 1000) {
    const { data, error: e2 } = await integ().from('venda_beepay_outbox').select('pedido_id')
      .in('status', ['enviando', 'enviado', 'erro']).gte('created_at', corte).order('pedido_id').range(from, from + 999)
    if (e2) throw new Error(`venda_beepay_outbox: ${e2.message}`)
    data.forEach(n => enviados.add(Number(n.pedido_id)))
    if (data.length < 1000) break
  }
  // nosso = marcado 'Vallen' OU codPedidoParceiro de um pedido que mandamos — desde que não
  // venha de OUTRO parceiro (iFood etc. com número coincidente) nem de outro terminal.
  const ehNosso = (c) => {
    const parceiro = String(c.nomeParceiro || '').trim()
    if (/^vallen$/i.test(parceiro)) return true
    if (!enviados.has(Number(c.codPedidoParceiro))) return false
    return !parceiro && (!conta.terminal || String(c.terminal_id) === String(conta.terminal))
  }

  const cupons = new Map()
  const chave = (c) => `${c.codcupom}:${c.loja_id}:${c.terminal_id}:${c.venda_id}`
  for (let ini = desde; ini <= ate;) {
    const d = new Date(`${ini}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 9)
    const fim = d.toISOString().slice(0, 10) < ate ? d.toISOString().slice(0, 10) : ate
    // paginação guiada por total_pages/total_records (a doc não diz se a página é 0- ou
    // 1-based nem o tamanho): 1ª chamada revela a base; no fim confere a contagem.
    let pg = await pos.api.listarCupons(0, ini, fim, filiais).catch(e => { if (e instanceof BeepayErro && e.status === 400) return null; throw e })
    let base = 0
    if (!pg || (Number(pg.current_page) === 1 && Number(pg.total_pages) >= 1)) { base = 1; pg ??= await pos.api.listarCupons(1, ini, fim, filiais) }
    const totalPg = Number(pg?.total_pages) || 0, totalReg = Number(pg?.total_records)
    const daJanela = new Set()
    for (let i = 0; ; i++) {
      for (const c of pg?.data || []) { daJanela.add(chave(c)); cupons.set(chave(c), c) }
      if (i + 1 >= totalPg || i > 1000) break
      pg = await pos.api.listarCupons(base + i + 1, ini, fim, filiais)
    }
    if (Number.isFinite(totalReg) && daJanela.size !== totalReg)
      throw new Error(`cupom/get ${ini}..${fim}: li ${daJanela.size} de ${totalReg} cupons — paginação não confere, nada importado`)
    const prox = new Date(`${fim}T12:00:00Z`); prox.setUTCDate(prox.getUTCDate() + 1)
    ini = prox.toISOString().slice(0, 10)
  }

  const todos = [...cupons.values()]
  const externos = todos.filter(c => !ehNosso(c))
  const eans = await eansPorCodigo(sb, pos, externos.flatMap(c => (c.itens || []).map(i => i.codproduto)))
  const payload = externos.map(c => mapCupom(c, (cod) => eans.get(String(cod)) ?? null))
  const res = { ok: true, periodo: `${desde}..${ate}`, cupons: todos.length, proprios: todos.length - externos.length, cancelados: payload.filter(p => p.cancelado).length, importados: 0 }
  if (dry) return { ...res, amostra: payload[0] || null }
  for (const b of chunks(payload, 200)) {
    const { data, error: e3 } = await integ().rpc('importar_vendas_beepay', { p: b })
    if (e3) throw new Error(`importar_vendas_beepay: ${e3.message}`)
    res.importados += typeof data === 'number' ? data : b.length
  }
  log(`pull Beepay ${res.periodo}: ${res.importados} importados, ${res.proprios} próprios ignorados`)
  return res
}
