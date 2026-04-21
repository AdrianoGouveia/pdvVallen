package com.vallen.maquininha.data

import com.vallen.maquininha.data.model.Produto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Mediador entre HomeViewModel/scanner (que detectam produto restrito)
 * e AgeVerificationScreen/HomeScreen (que navega e mostra o banner).
 */
object AgeCheckGate {
    private val _pending = MutableStateFlow<Produto?>(null)
    val pending: StateFlow<Produto?> = _pending.asStateFlow()

    private val _showDenied = MutableStateFlow(false)
    val showDenied: StateFlow<Boolean> = _showDenied.asStateFlow()

    fun request(produto: Produto) { _pending.value = produto }
    fun consume() { _pending.value = null }
    fun deny() {
        _pending.value = null
        _showDenied.value = true
    }
    fun dismissDenied() { _showDenied.value = false }

    fun reset() {
        _pending.value = null
        _showDenied.value = false
    }
}
