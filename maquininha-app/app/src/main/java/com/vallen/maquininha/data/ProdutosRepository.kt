package com.vallen.maquininha.data

import com.vallen.maquininha.data.model.NovoItemPedido
import com.vallen.maquininha.data.model.NovoPedido
import com.vallen.maquininha.data.model.Pedido
import com.vallen.maquininha.data.model.Produto
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

data class ItemCarrinho(
    val produto: Produto,
    val quantidade: Int
) {
    val subtotal: Double get() = produto.preco * quantidade
}

object ProdutosRepository {
    private val client get() = SupabaseModule.client

    suspend fun listar(unidadeId: Long): List<Produto> =
        client.postgrest.rpc(
            "listar_planograma",
            buildJsonObject { put("p_unidade_id", JsonPrimitive(unidadeId)) }
        ).decodeList()

    suspend fun porCodigoBarras(unidadeId: Long, codigo: String): Produto? =
        client.postgrest.rpc(
            "buscar_produto_planograma",
            buildJsonObject {
                put("p_unidade_id", JsonPrimitive(unidadeId))
                put("p_codigo_barras", JsonPrimitive(codigo))
            }
        ).decodeList<Produto>().firstOrNull()

    suspend fun buscar(unidadeId: Long, termo: String): List<Produto> {
        val q = termo.trim()
        if (q.isEmpty()) return listar(unidadeId)
        val todos = listar(unidadeId)
        return todos.filter { it.nome.contains(q, ignoreCase = true) }
    }

    suspend fun registrarPendencia(unidadeId: Long, codigoBarras: String) {
        client.postgrest.rpc(
            "registrar_pendencia",
            buildJsonObject {
                put("p_unidade_id", JsonPrimitive(unidadeId))
                put("p_codigo_barras", JsonPrimitive(codigoBarras))
            }
        )
    }

    suspend fun criarPedido(
        unidadeId: Long?,
        terminalId: Long?,
        itens: List<ItemCarrinho>
    ): Pedido {
        val total = itens.sumOf { it.subtotal }
        val novo = NovoPedido(
            total = total,
            unidadeId = unidadeId,
            terminalId = terminalId
        )
        val pedido = client.from("pedidos").insert(novo) { select() }.decodeSingle<Pedido>()
        val rows = itens.map {
            NovoItemPedido(
                pedidoId = pedido.id,
                produtoId = it.produto.id,
                quantidade = it.quantidade,
                precoUnitario = it.produto.preco
            )
        }
        if (rows.isNotEmpty()) client.from("itens_pedido").insert(rows)
        return pedido
    }

    suspend fun venderItem(unidadeId: Long, produtoId: Long, quantidade: Int) {
        client.postgrest.rpc(
            "vender_item",
            buildJsonObject {
                put("p_unidade_id", JsonPrimitive(unidadeId))
                put("p_produto_id", JsonPrimitive(produtoId))
                put("p_qtd", JsonPrimitive(quantidade))
            }
        )
    }
}
