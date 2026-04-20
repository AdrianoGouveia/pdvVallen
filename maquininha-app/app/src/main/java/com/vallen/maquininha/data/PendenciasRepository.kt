package com.vallen.maquininha.data

import com.vallen.maquininha.data.model.CategoriaSimples
import com.vallen.maquininha.data.model.PendenciaItem
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.storage.storage
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

object PendenciasRepository {
    private val client get() = SupabaseModule.client
    private const val BUCKET = "produto-fotos"

    suspend fun listar(unidadeId: Long): List<PendenciaItem> =
        client.postgrest.rpc(
            "listar_pendencias",
            buildJsonObject { put("p_unidade_id", JsonPrimitive(unidadeId)) }
        ).decodeList()

    suspend fun listarCategorias(unidadeId: Long): List<CategoriaSimples> =
        client.postgrest.rpc(
            "listar_categorias_unidade",
            buildJsonObject { put("p_unidade_id", JsonPrimitive(unidadeId)) }
        ).decodeList()

    suspend fun adicionarAoPlanograma(
        unidadeId: Long,
        produtoId: Long,
        precoVenda: Double,
        quantidade: Int?,
        controlaEstoque: Boolean
    ) {
        client.postgrest.rpc(
            "adicionar_ao_planograma",
            buildJsonObject {
                put("p_unidade_id",       JsonPrimitive(unidadeId))
                put("p_produto_id",       JsonPrimitive(produtoId))
                put("p_preco_venda",      JsonPrimitive(precoVenda))
                put("p_quantidade",       quantidade?.let(::JsonPrimitive) ?: JsonNull)
                put("p_controla_estoque", JsonPrimitive(controlaEstoque))
            }
        )
    }

    suspend fun cadastrarProduto(
        unidadeId: Long,
        codigoBarras: String,
        nome: String,
        precoVenda: Double,
        categoria: String?,
        emoji: String?,
        imagemUrl: String?,
        restritoIdade: Boolean,
        quantidade: Int?,
        controlaEstoque: Boolean
    ) {
        client.postgrest.rpc(
            "cadastrar_produto_pendencia",
            buildJsonObject {
                put("p_unidade_id",       JsonPrimitive(unidadeId))
                put("p_codigo_barras",    JsonPrimitive(codigoBarras))
                put("p_nome",             JsonPrimitive(nome))
                put("p_preco_venda",      JsonPrimitive(precoVenda))
                put("p_categoria",        categoria?.let(::JsonPrimitive) ?: JsonNull)
                put("p_emoji",            emoji?.let(::JsonPrimitive) ?: JsonNull)
                put("p_imagem_url",       imagemUrl?.let(::JsonPrimitive) ?: JsonNull)
                put("p_restrito_idade",   JsonPrimitive(restritoIdade))
                put("p_quantidade",       quantidade?.let(::JsonPrimitive) ?: JsonNull)
                put("p_controla_estoque", JsonPrimitive(controlaEstoque))
            }
        )
    }

    /**
     * Faz upload da foto e devolve a URL pública.
     * O path inclui unidade + codigo_barras + timestamp para evitar colisão.
     */
    suspend fun uploadFoto(unidadeId: Long, codigoBarras: String, bytes: ByteArray): String {
        val safe = codigoBarras.replace(Regex("[^A-Za-z0-9_-]"), "_")
        val path = "u$unidadeId/${safe}_${System.currentTimeMillis()}.jpg"
        val bucket = client.storage.from(BUCKET)
        bucket.upload(path, bytes) { upsert = true }
        return bucket.publicUrl(path)
    }
}
