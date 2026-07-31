// Contrato da camada anticorrupção. O núcleo (verificar-pix, crons) fala SÓ com
// esta interface, em tipos canônicos. Trocar de PDV = nova implementação daqui.
//
// Métodos "in" (leitura do PDV → nosso formato) e "out" (nosso → PDV). Os dois
// métodos de estoque/venda decidem o COMPORTAMENTO por modo, mantendo o
// verificar-pix agnóstico.

/**
 * @typedef {import('./types.js').CanonUnidade}   CanonUnidade
 * @typedef {import('./types.js').CanonProduto}   CanonProduto
 * @typedef {import('./types.js').CanonCategoria} CanonCategoria
 * @typedef {import('./types.js').CanonVendaPush} CanonVendaPush
 * @typedef {import('./types.js').CanonEstoqueEvt}CanonEstoqueEvt
 */

export class PosConnector {
  /** identificador do connector (ex.: 'none', 'dwpdv') */
  get id() { return 'base' }

  // ── leitura (pull) ─────────────────────────────────────────────────────────
  /** @returns {Promise<CanonUnidade[]>} */          async pullCompanies() { return [] }
  /** @returns {Promise<CanonCategoria[]>} */         async pullCategorias(_since) { return [] }
  /** @returns {Promise<CanonProduto[]>} */           async pullProdutos(_since, _opts) { return [] }
  /** Lookup on-demand por código de barras (Scan & Go). @returns {Promise<CanonProduto|null>} */
  async buscarPorEan(_ean) { return null }
  /** @returns {Promise<Object[]>} */                 async pullClientes(_doc) { return [] }
  /** @returns {Promise<Object[]>} */                 async pullVendas(_since) { return [] }

  // ── escrita (push) ─────────────────────────────────────────────────────────
  /** @param {CanonVendaPush} _venda @returns {Promise<{externalId?:string}>} */
  async pushVenda(_venda) { return {} }

  // ── comportamento por modo (mantém verificar-pix agnóstico) ─────────────────
  /** Baixa estoque LOCAL. Modo B faz (vender_item); Modo A é no-op (PDV é dono). */
  async reservaEstoqueLocal(_supabase, _pedido, _itens) {}
  /** Enfileira a venda p/ empurrar ao PDV. Modo B é no-op; Modo A grava outbox. */
  async enfileirarVenda(_supabase, _venda) {}

  // ── webhook de estoque (inbound) ────────────────────────────────────────────
  /** @returns {CanonEstoqueEvt[]} */                 parseWebhookEstoque(_payload) { return [] }
}
