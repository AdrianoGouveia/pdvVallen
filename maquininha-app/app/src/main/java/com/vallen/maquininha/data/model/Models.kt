package com.vallen.maquininha.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Unidade(
    val id: Long,
    val nome: String
)

@Serializable
data class Terminal(
    val id: Long,
    @SerialName("unidade_id") val unidadeId: Long,
    val nome: String,
    val serial: String? = null,
    val ativo: Boolean = true
)

@Serializable
data class NovoTerminal(
    @SerialName("unidade_id") val unidadeId: Long,
    val nome: String,
    val serial: String? = null
)

@Serializable
data class Pedido(
    val id: Long,
    val total: Double,
    val status: String,
    val provider: String? = null,
    @SerialName("terminal_id") val terminalId: Long? = null,
    @SerialName("unidade_id") val unidadeId: Long? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class PedidoUpdate(
    val status: String,
    val nsu: String? = null,
    val bandeira: String? = null,
    @SerialName("tipo_cartao") val tipoCartao: String? = null
)

@Serializable
data class Produto(
    val id: Long,
    val nome: String,
    val preco: Double,
    @SerialName("codigo_barras") val codigoBarras: String,
    val estoque: Int? = null,
    val emoji: String? = null,
    @SerialName("imagem_url") val imagemUrl: String? = null,
    @SerialName("restrito_idade") val restritoIdade: Boolean = false,
    val categoria: String? = null
)

@Serializable
data class Franqueado(
    val id: Long,
    @SerialName("tipo_doc") val tipoDoc: String,
    val documento: String,
    @SerialName("razao_social") val razaoSocial: String,
    @SerialName("nome_fantasia") val nomeFantasia: String? = null
)

@Serializable
data class UsuarioFranqueado(
    @SerialName("franqueado_id") val franqueadoId: Long,
    val role: String,
    val franqueados: Franqueado? = null
)

@Serializable
data class NovoPedido(
    val total: Double,
    val status: String = "aguardando",
    val provider: String = "maquininha",
    @SerialName("unidade_id") val unidadeId: Long?,
    @SerialName("terminal_id") val terminalId: Long?
)

@Serializable
data class NovoItemPedido(
    @SerialName("pedido_id") val pedidoId: Long,
    @SerialName("produto_id") val produtoId: Long,
    val quantidade: Int,
    @SerialName("preco_unitario") val precoUnitario: Double
)

@Serializable
data class PendenciaItem(
    val id: Long,
    @SerialName("codigo_barras")       val codigoBarras: String,
    val tentativas: Int,
    @SerialName("last_seen_at")        val lastSeenAt: String? = null,
    @SerialName("produto_cadastrado")  val produtoCadastrado: Boolean,
    @SerialName("produto_id")          val produtoId: Long? = null,
    @SerialName("produto_nome")        val produtoNome: String? = null,
    @SerialName("produto_emoji")       val produtoEmoji: String? = null,
    @SerialName("produto_imagem_url")  val produtoImagemUrl: String? = null,
    @SerialName("produto_categoria")   val produtoCategoria: String? = null,
    @SerialName("produto_preco_ref")   val produtoPrecoRef: Double? = null
)

@Serializable
data class CategoriaSimples(
    val nome: String,
    val emoji: String? = null
)
