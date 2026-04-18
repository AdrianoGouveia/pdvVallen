package com.vallen.maquininha.data

import com.vallen.maquininha.data.model.Franqueado
import com.vallen.maquininha.data.model.Unidade
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

object AuthRepository {
    private val client get() = SupabaseModule.client

    val logado: Boolean
        get() = client.auth.currentUserOrNull() != null

    suspend fun login(email: String, senha: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = senha
        }
    }

    suspend fun logout() {
        runCatching { client.auth.signOut() }
    }

    suspend fun listarFranqueadosDoUsuario(): List<Franqueado> {
        return client.from("usuarios_franqueados")
            .select(Columns.raw("franqueado_id, role, franqueados(id,tipo_doc,documento,razao_social,nome_fantasia)"))
            .decodeList<UsuarioFranqueadoRow>()
            .mapNotNull { it.franqueados }
    }

    suspend fun listarUnidadesDoFranqueado(franqueadoId: Long): List<Unidade> =
        client.from("unidades").select {
            filter {
                eq("franqueado_id", franqueadoId)
                eq("ativo", true)
                neq("tipo", "armazem")
            }
            order("nome", Order.ASCENDING)
        }.decodeList()
}

@kotlinx.serialization.Serializable
private data class UsuarioFranqueadoRow(
    @kotlinx.serialization.SerialName("franqueado_id") val franqueadoId: Long,
    val role: String,
    val franqueados: Franqueado? = null
)
