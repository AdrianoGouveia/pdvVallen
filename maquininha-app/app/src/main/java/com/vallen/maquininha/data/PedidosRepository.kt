package com.vallen.maquininha.data

import com.vallen.maquininha.data.model.NovoTerminal
import com.vallen.maquininha.data.model.Pedido
import com.vallen.maquininha.data.model.PedidoUpdate
import com.vallen.maquininha.data.model.Terminal
import com.vallen.maquininha.data.model.Unidade
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

object PedidosRepository {
    private val client get() = SupabaseModule.client

    suspend fun listarUnidades(): List<Unidade> =
        client.from("unidades").select().decodeList()

    suspend fun listarTerminais(unidadeId: Long): List<Terminal> =
        client.from("terminais").select {
            filter {
                eq("unidade_id", unidadeId)
                eq("ativo", true)
            }
        }.decodeList()

    suspend fun criarTerminal(novo: NovoTerminal): Terminal =
        client.from("terminais").insert(novo) { select() }.decodeSingle()

    suspend fun buscarPedido(pedidoId: Long): Pedido? =
        client.from("pedidos").select {
            filter { eq("id", pedidoId) }
            limit(1)
        }.decodeSingleOrNull()

    suspend fun atualizarPedido(pedidoId: Long, update: PedidoUpdate) {
        client.from("pedidos").update(update) {
            filter { eq("id", pedidoId) }
        }
    }

    /** Emite o id do pedido toda vez que um novo INSERT chega pro terminal. */
    fun pedidosPendentes(terminalId: Long): Flow<Long> {
        val channel = client.channel("pedidos-terminal-$terminalId")
        val flow = channel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
            table = "pedidos"
            filter("terminal_id", io.github.jan.supabase.postgrest.query.filter.FilterOperator.EQ, terminalId)
        }
        return flow
            .onStart { channel.subscribe() }
            .map { action ->
                val rec = action.record
                val id = rec["id"]?.jsonPrimitive?.longOrNull ?: -1L
                val status = rec["status"]?.asString()
                val provider = rec["provider"]?.asString()
                Triple(id, status, provider)
            }
            .filter { (id, status, provider) ->
                id > 0 && status == "aguardando" && provider == "maquininha"
            }
            .map { it.first }
    }
}

private fun kotlinx.serialization.json.JsonElement.asString(): String? =
    (this as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
