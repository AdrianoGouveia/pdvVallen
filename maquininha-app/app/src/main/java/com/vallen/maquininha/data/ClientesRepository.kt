package com.vallen.maquininha.data

import com.vallen.maquininha.data.model.Cliente
import com.vallen.maquininha.data.model.NovoCliente
import io.github.jan.supabase.postgrest.from

object ClientesRepository {
    private val client get() = SupabaseModule.client

    suspend fun buscarPorCpf(cpfDigits: String): Cliente? =
        client.from("clientes")
            .select {
                filter { eq("cpf", cpfDigits) }
                limit(1)
            }
            .decodeList<Cliente>()
            .firstOrNull()

    suspend fun cadastrar(
        cpf: String,
        nome: String,
        dataNascimentoIso: String,
        telefone: String?,
        unidadeId: Long?
    ) {
        client.from("clientes").insert(
            NovoCliente(
                cpf = cpf,
                nome = nome.trim(),
                dataNascimento = dataNascimentoIso,
                telefone = telefone?.takeIf { it.isNotBlank() },
                unidadeId = unidadeId
            )
        )
    }
}
