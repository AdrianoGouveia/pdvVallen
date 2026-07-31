import { PosConnector } from './PosConnector.js'

// Modo B — Vallen STANDALONE (INTEGRACAO_POS=none). É o comportamento de HOJE:
// nós somos donos do estoque; a venda baixa via RPC vender_item (planograma +
// estoque_cnpj). Todos os métodos de leitura/push do PDV são no-op.
export class NoneConnector extends PosConnector {
  get id() { return 'none' }

  // Baixa de estoque LOCAL — idêntico ao loop atual do verificar-pix.js.
  async reservaEstoqueLocal(supabase, pedido, itens) {
    for (const item of itens) {
      const { error } = await supabase.rpc('vender_item', {
        p_unidade_id: pedido?.unidadeId,
        p_produto_id: item.produto_id,
        p_qtd: item.quantidade,
      })
      if (error) console.error(`vender_item pedido ${pedido?.pedidoId} produto ${item.produto_id}:`, error.message)
    }
  }

  // Standalone não empurra venda pra lugar nenhum.
  async enfileirarVenda() {}
}
