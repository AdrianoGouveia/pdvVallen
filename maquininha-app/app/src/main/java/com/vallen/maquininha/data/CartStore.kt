package com.vallen.maquininha.data

import com.vallen.maquininha.data.model.Produto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Estado global do carrinho. Singleton simples; compartilhado entre Home,
 * Cart e Payment sem passar ViewModel por parâmetro.
 */
object CartStore {
    private val _items = MutableStateFlow<List<ItemCarrinho>>(emptyList())
    val items: StateFlow<List<ItemCarrinho>> = _items.asStateFlow()

    private val _ageVerified = MutableStateFlow(false)
    val ageVerified: StateFlow<Boolean> = _ageVerified.asStateFlow()

    val total: Double get() = _items.value.sumOf { it.subtotal }
    val count: Int get() = _items.value.sumOf { it.quantidade }

    fun add(produto: Produto, qty: Int = 1) {
        _items.update { list ->
            val i = list.indexOfFirst { it.produto.id == produto.id }
            if (i >= 0) {
                list.toMutableList().also { m -> m[i] = m[i].copy(quantidade = m[i].quantidade + qty) }
            } else {
                list + ItemCarrinho(produto = produto, quantidade = qty)
            }
        }
        syncAgeVerified()
    }

    fun setQuantidade(produtoId: Long, qty: Int) {
        _items.update { list ->
            if (qty <= 0) list.filterNot { it.produto.id == produtoId }
            else list.map { if (it.produto.id == produtoId) it.copy(quantidade = qty) else it }
        }
        syncAgeVerified()
    }

    fun remove(produtoId: Long) = setQuantidade(produtoId, 0)

    fun clear() {
        _items.value = emptyList()
        _ageVerified.value = false
    }

    fun markAgeVerified() { _ageVerified.value = true }

    /**
     * Se não houver mais itens restritos no carrinho, invalida a verificação:
     * próxima cerveja adicionada pede CPF de novo.
     */
    private fun syncAgeVerified() {
        if (_items.value.none { it.produto.restritoIdade }) _ageVerified.value = false
    }
}
