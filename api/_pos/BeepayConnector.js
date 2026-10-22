import { PosConnector } from './PosConnector.js'
import { BeepayWeb } from './beepay/BeepayWeb.js'
import { BeepayApi } from './beepay/BeepayApi.js'
import { BeepayNaoSuportado } from './beepay/erros.js'

export * from './beepay/erros.js'

// ÚNICO lugar que conhece o Beepay Cloud (Tablet Cloud / PDV Legal). Dois transportes,
// escolhidos POR OPERAÇÃO (BEEPAY_TRANSPORTE = auto | web | api; default auto):
//
//  (web) painel bep.tabletcloud.com.br com login próprio (BEEPAY_EMAIL/PASSWORD) +
//        postbacks WebForms. Cobre catálogo (GTIN, cadastro) e inventário por planilha.
//  (api) api.tabletcloud.com.br OAuth (exige BEEPAY_CLIENT_ID/SECRET, só o OEM libera).
//        Cobre o REGISTRO DE VENDA (cupom/save) — não há tela web conhecida p/ isso.
//
// Quando a API ganhar credencial e um método equivalente (ex.: produtos por EAN), basta
// implementá-lo em BeepayApi: o roteamento `auto` passa a preferir a API sozinho.
// ⚠️ Não está no factory.js (INTEGRACAO_POS): dono do estoque com Beepay ainda não foi
//    decidido. Por ora é usado pelos scripts (beepay-sync.mjs).
export class BeepayConnector extends PosConnector {
  get id() { return 'beepay' }

  constructor({ debugDir, log, transporte = process.env.BEEPAY_TRANSPORTE || 'auto' } = {}) {
    super()
    this.web = new BeepayWeb({ debugDir, log })
    this.api = new BeepayApi()
    this.transporte = transporte
  }

  #via(op) {
    const apiPode = this.api.configurado && typeof this.api[op] === 'function'
    if (this.transporte === 'api' || (this.transporte === 'auto' && apiPode)) {
      if (!apiPode) throw new BeepayNaoSuportado(`${op}: transporte api não implementa/configurado`)
      return this.api
    }
    if (typeof this.web[op] !== 'function') throw new BeepayNaoSuportado(`${op}: transporte web não suporta`)
    return this.web
  }

  login() { return this.web.login() }

  // ── catálogo ────────────────────────────────────────────────────────────────
  /** @returns {Promise<import('./types.js').CanonProduto|null>} */
  buscarPorEan(ean) { return this.#via('buscarPorEan').buscarPorEan(ean) }
  /** resposta crua (inclui base colaborativa: NCM/CEST/Grupo sugeridos) */
  consultarGtin(ean) { return this.#via('consultarGtin').consultarGtin(ean) }
  /** idempotente por EAN → { acao: 'criado'|'existente'|'atualizado', produto, avisos? } */
  cadastrarProduto(p, opts) { return this.#via('cadastrarProduto').cadastrarProduto(p, opts) }

  // ── estoque ─────────────────────────────────────────────────────────────────
  /** prévia (default) ou confirmação do inventário. Ver BeepayWeb.inventario. */
  inventario(itens, opts) { return this.#via('inventario').inventario(itens, opts) }

  // ── venda ───────────────────────────────────────────────────────────────────
  /**
   * Registra a venda aprovada no Beepay (cupom). Só API (cupom/save).
   * @param {import('./types.js').CanonVendaRegistro} venda  @param {Object} conta ids Beepay
   */
  registrarVenda(venda, conta) {
    if (!this.api.configurado) throw new BeepayNaoSuportado('registro de venda exige a API oficial (BEEPAY_CLIENT_ID/SECRET)')
    return this.api.salvarCupom(venda, conta)
  }

  recon() { return this.web.recon() }
  apiInfo() { return this.api.info() }
}

// ids da conta Beepay p/ montar o cupom, do ambiente. A FILIAL não vem daqui: é por
// unidade, na tabela integracao.beepay_filial (a mesma que o trigger de pedidos usa).
// Sem default p/ terminal/formas: enquanto faltarem, as vendas esperam PENDENTES.
//   BEEPAY_USUARIO        usuário PDV que "recebe" (conta hoje: 687972 admin)
//   BEEPAY_TERMINAL       terminal_id ≤ 12 (cadastrar ponto de venda/terminal no Beepay)
//   BEEPAY_PONTO_VENDA    opcional (pontovenda/get)
//   BEEPAY_FORMA_PIX|CREDITO|DEBITO  codformarecebimentopdv (formapagamentopdv/get)
//   BEEPAY_BAIXA_ESTOQUE  default true (cupom baixa estoque no Beepay)
//   BEEPAY_EMITIR_NFCE    default false. NÃO implementado: cupom vai sem `notas` e sem
//                         pedir emissão (filial sem certificado, tributos ND). Se ligar,
//                         o worker segura as vendas pendentes até alguém implementar.
export function contaBeepayDoEnv(env = process.env) {
  return {
    terminal: env.BEEPAY_TERMINAL || null,
    usuario: env.BEEPAY_USUARIO || null,
    pontoVenda: env.BEEPAY_PONTO_VENDA || null,
    formas: { pix: env.BEEPAY_FORMA_PIX || null, credito: env.BEEPAY_FORMA_CREDITO || null, debito: env.BEEPAY_FORMA_DEBITO || null },
    baixaEstoque: env.BEEPAY_BAIXA_ESTOQUE !== 'false',
    emitirNfce: env.BEEPAY_EMITIR_NFCE === 'true',
  }
}
