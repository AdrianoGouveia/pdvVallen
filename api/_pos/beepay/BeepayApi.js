// Transporte API OFICIAL do Beepay/Tablet Cloud (https://api.tabletcloud.com.br, doc em
// /Help). OAuth password grant: client_id/secret = código/senha da EMPRESA (só o OEM
// Beepay libera) + usuário/senha. Token dura 6h. Enquanto BEEPAY_CLIENT_ID/SECRET não
// existem, `configurado` = false e o conector usa só o transporte web.
//
// Venda: POST cupom/save ("grava ou atualiza um cupom de venda", modelo Cupom22).
// IDs da conta (filial, usuário PDV, terminal, formas de recebimento) vêm do ambiente;
// descobrir com `beepay-sync.mjs api-info` (filial/get, usuariopdv/get, formapagamentopdv/get,
// dispositivo/get, pontovenda/get) assim que houver credencial.
import { BeepayNaoConfigurado, BeepayErro, BeepayAguardandoConfig } from './erros.js'

const API = (process.env.BEEPAY_API_BASE || 'https://api.tabletcloud.com.br').replace(/\/+$/, '')

// timestamptz/ISO → "2026-10-17T19:05:01-03:00" (horário de Brasília, como o PDV grava)
export function isoBrt(v) {
  const d = new Date(v ?? Date.now())
  if (Number.isNaN(d.getTime())) throw new BeepayErro(`data inválida: ${v}`)
  return new Date(d.getTime() - 3 * 3600_000).toISOString().replace(/\.\d{3}Z$/, '-03:00')
}
const r2 = (n) => Math.round(Number(n) * 100) / 100

// Produto da API (camelCase no JSON, PascalCase no XML) → forma mínima p/ o cache
function mapProdutoApi(p) {
  const g = (k) => p[k] ?? p[k[0].toUpperCase() + k.slice(1)]
  const s = (x) => (x == null || x === '' ? null : String(x))
  return { codigo: s(g('codigo')), codigoVenda: s(g('codigoVenda')), codigoEAN: s(g('codigoEAN'))?.replace(/\D/g, '') || null, nome: s(g('descricaoCupom')) }
}

export class BeepayApi {
  #cfg; #token = null; #exp = 0
  constructor(cfg = {}) {
    const e = process.env
    this.#cfg = {
      email: cfg.email ?? e.BEEPAY_EMAIL, senha: cfg.senha ?? e.BEEPAY_PASSWORD,
      clientId: cfg.clientId ?? e.BEEPAY_CLIENT_ID, clientSecret: cfg.clientSecret ?? e.BEEPAY_CLIENT_SECRET,
    }
  }
  get configurado() { const c = this.#cfg; return !!(c.email && c.senha && c.clientId && c.clientSecret) }

  async #getToken() {
    if (this.#token && Date.now() < this.#exp) return this.#token
    if (!this.configurado) throw new BeepayNaoConfigurado('API Beepay: faltam BEEPAY_CLIENT_ID/BEEPAY_CLIENT_SECRET (código/senha da empresa — pedir ao Beepay)')
    const c = this.#cfg
    const body = new URLSearchParams({ username: c.email, password: c.senha, grant_type: 'password', client_id: c.clientId, client_secret: c.clientSecret })
    const r = await fetch(`${API}/token`, { method: 'POST', body, signal: AbortSignal.timeout(30_000) })
    const j = await r.json().catch(() => ({}))
    if (!j.access_token) throw new BeepayErro(`API Beepay /token: ${j.error_description || j.error || `HTTP ${r.status}`}`)
    this.#token = j.access_token
    this.#exp = Date.now() + Math.max(60, (Number(j.expires_in) || 21600) - 300) * 1000
    return this.#token
  }

  async #req(method, path, body) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const tk = await this.#getToken()
      const r = await fetch(`${API}/${path.replace(/^\//, '')}`, {
        method, signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      const txt = await r.text()
      if (r.status === 401 && tentativa === 0) { this.#token = null; continue } // token expirado/revogado
      if (!r.ok) throw new BeepayErro(`API Beepay ${method} ${path}: HTTP ${r.status} ${txt.slice(0, 300)}`, { status: r.status })
      try { return txt ? JSON.parse(txt) : null } catch { return txt }
    }
  }
  get(path) { return this.#req('GET', path) }
  post(path, body) { return this.#req('POST', path, body) }
  put(path, body) { return this.#req('PUT', path, body) }

  // ── descoberta dos IDs da conta (shapes crus — conferir no 1º uso) ─────────
  async info() {
    const tenta = (p) => this.get(p).catch(e => ({ erro: e.message }))
    const [filiais, usuarios, formas, dispositivos, pontosVenda] = await Promise.all(
      ['filial/get', 'usuariopdv/get', 'formapagamentopdv/get', 'dispositivo/get', 'pontovenda/get'].map(tenta))
    return { filiais, usuarios, formas, dispositivos, pontosVenda }
  }

  // ── leitura p/ o pull de vendas e o cache de códigos ────────────────────────
  /** CupomPaginado {total_records,total_pages,current_page,data:[Cupom]} — período ≤ 10 dias */
  listarCupons(offset, dataIni, dataFim, filiais) {
    return this.get(`cupom/get/${offset}/${dataIni}/${dataFim}/${encodeURIComponent(filiais)}`)
  }
  /** produto pelo código interno (ou externo) → { codigo, codigoVenda, codigoEAN, nome } */
  async produtoPorCodigo(codigo) {
    const p = await this.get(`produtos/get/${encodeURIComponent(codigo)}`)
    return p ? mapProdutoApi(p) : null
  }
  async listarProdutos() { return (await this.get('produtos/get') || []).map(mapProdutoApi) }

  // ── venda ───────────────────────────────────────────────────────────────────
  /** @param {import('../types.js').CanonVendaRegistro} v  @param {Object} conta ids Beepay */
  async salvarCupom(v, conta) { return this.post('cupom/save', montarCupom(v, conta)) }
  async estornarCupom(vendaId, codFilial, terminal) {
    return this.put(`cupom/estornar/${encodeURIComponent(vendaId)}/${encodeURIComponent(codFilial)}/${encodeURIComponent(terminal)}`)
  }
}

/**
 * Venda canônica → Cupom22 (POST cupom/save). `conta` = { filial, terminal, usuario,
 * pontoVenda?, formas:{pix,credito,debito}, baixaEstoque? }. Puro: testável sem rede.
 * Idempotência: venda_id_pdv + codPedidoParceiro = id do pedido Vallen, no MESMO terminal
 * → reenvio deve atualizar o cupom em vez de duplicar (endpoint é "grava OU atualiza").
 */
export function montarCupom(v, conta) {
  // lacunas de CONFIGURAÇÃO → BeepayAguardandoConfig (venda espera pendente, não é erro)
  const espera = (m) => { throw new BeepayAguardandoConfig(`cupom: ${m}`) }
  if (conta?.emitirNfce) espera('emissão de NFC-e pela integração não implementada (BEEPAY_EMITIR_NFCE deve ficar false)')
  for (const k of ['filial', 'terminal', 'usuario']) if (!conta?.[k]) espera(`falta ${k} da conta Beepay (env BEEPAY_${k.toUpperCase()})`)
  const terminal = String(conta.terminal)
  if (terminal.length > 12) espera('terminal_id tem no máximo 12 caracteres')
  const forma = v.pagamento?.forma
  const codForma = conta.formas?.[forma]
  if (!codForma) espera(`sem código Beepay p/ a forma "${forma}" (cadastrar no Beepay e pôr em BEEPAY_FORMA_${String(forma).toUpperCase()})`)
  // fluxo da maquininha web (/mesa, /loja) hoje não grava itens_pedido → espera, não é erro
  if (!v.itens?.length) espera(`pedido ${v.pedidoId} sem itens_pedido (MaquininhaMesa não grava os itens)`)
  const itens = v.itens.map(i => {
    if (!i.beepayCodigo) espera(`item ${i.codigoBarras || '(sem EAN)'} sem código Beepay (produto não cadastrado lá)`)
    return {
      codproduto: Number(i.beepayCodigo),
      codigoVenda: i.beepayCodigoVenda != null ? String(i.beepayCodigoVenda) : undefined,
      nomeProduto: i.nome,
      quantidade: Number(i.quantidade),
      valortotal: r2(i.quantidade * i.precoUnitario),
      valorcusto: i.custo != null ? r2(i.custo) : undefined,
      valordesconto: 0, valoracrescimo: 0, iscancelado: false,
      usuariooperador_id: Number(conta.usuario),
      ...(conta.pontoVenda ? { pontovenda_id: Number(conta.pontoVenda) } : {}),
      dtmovimento: isoBrt(v.ocorridoEm),
    }
  })
  const somaItens = r2(itens.reduce((s, i) => s + i.valortotal, 0))
  const total = r2(v.total)
  // itens ≠ total pago (o total vem do cliente no criar-pagamento) → NÃO inventa
  // desconto/acréscimo: vai p/ conferência manual. Tolerância só de arredondamento.
  if (Math.abs(somaItens - total) > 0.01)
    throw new BeepayErro(`cupom: itens somam ${somaItens.toFixed(2)} mas o pedido ${v.pedidoId} pagou ${total.toFixed(2)} — conferir`)
  const desconto = 0, acrescimo = 0
  const pg = v.pagamento || {}
  return {
    nomeParceiro: 'Vallen',
    codPedidoParceiro: Number(v.pedidoId),
    venda_id_pdv: Number(v.pedidoId),
    loja_id: Number(conta.filial),
    terminal_id: terminal,
    usuariorecebimento_id: Number(conta.usuario),
    usuarioentregador_id: Number(conta.usuario),
    valortotal: total, valordesconto: desconto, valoracrescimo: acrescimo, valorentrega: 0,
    isestornado: false, iscancelado: false,
    baixaEstoqueEnabled: conta.baixaEstoque !== false,
    dtabertura: isoBrt(v.ocorridoEm), dtmovimento: isoBrt(v.ocorridoEm), dtrecebimento: isoBrt(v.pagoEm || v.ocorridoEm),
    ...(conta.pontoVenda ? { pontoVenda: Number(conta.pontoVenda) } : {}),
    itens,
    formaPgtos: [{
      codformarecebimentopdv: Number(codForma),
      nome: { pix: 'PIX', credito: 'CARTAO CREDITO', debito: 'CARTAO DEBITO' }[forma] || String(forma).toUpperCase(),
      valortotal: total,
      detalhes: [{
        gateway: pg.gateway || undefined, nsu: pg.nsu || undefined, bandeira: pg.bandeira || undefined,
        idtransacao: pg.idTransacao || undefined, parcelas: 1,
        dtAutorizacaoPgto: isoBrt(v.pagoEm || v.ocorridoEm),
      }],
    }],
    // sem `clientes`: CPF não sai do Vallen (LGPD) até a NFC-e exigir
  }
}
