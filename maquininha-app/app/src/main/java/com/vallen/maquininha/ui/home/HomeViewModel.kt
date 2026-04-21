package com.vallen.maquininha.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vallen.maquininha.data.AgeCheckGate
import com.vallen.maquininha.data.CartStore
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.data.ProdutosRepository
import com.vallen.maquininha.data.model.Produto
import com.vallen.maquininha.scanner.BarcodeScanner
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

const val CATEGORIA_TODOS = "todos"

data class HomeUiState(
    val loading: Boolean = true,
    val termo: String = "",
    val categoriaSelecionada: String = CATEGORIA_TODOS,
    val categorias: List<String> = listOf(CATEGORIA_TODOS),
    val produtosTodos: List<Produto> = emptyList(),
    val erro: String? = null,
    val aviso: String? = null,
    val itensNoCarrinho: Int = 0,
    val totalCarrinho: Double = 0.0
) {
    val produtos: List<Produto>
        get() = if (categoriaSelecionada == CATEGORIA_TODOS) produtosTodos
                else produtosTodos.filter { it.categoria.equals(categoriaSelecionada, ignoreCase = true) }
}

class HomeViewModel : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    @OptIn(FlowPreview::class)
    private val termoFlow = MutableStateFlow("")

    init {
        carregar("")
        observarBusca()
        observarCarrinho()
        observarScanner()
    }

    fun setTermo(t: String) {
        _state.update { it.copy(termo = t) }
        termoFlow.value = t
    }

    fun setCategoria(c: String) {
        _state.update { it.copy(categoriaSelecionada = c) }
    }

    fun adicionar(produto: Produto) {
        viewModelScope.launch {
            if (deveVerificarIdade(produto)) {
                AgeCheckGate.request(produto)
            } else {
                CartStore.add(produto)
                _state.update { it.copy(aviso = "${produto.nome} · +1") }
            }
        }
    }

    private suspend fun deveVerificarIdade(produto: Produto): Boolean {
        if (!produto.restritoIdade) return false
        if (CartStore.ageVerified.value) return false
        return Prefs.ageCheckEnabled.first()
    }

    fun limparAviso() { _state.update { it.copy(aviso = null) } }

    private fun carregar(termo: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, erro = null) }
            try {
                val unidadeId = Prefs.unidadeId.first()
                    ?: throw IllegalStateException("Unidade não configurada")
                val lista = ProdutosRepository.buscar(unidadeId, termo)
                val cats = buildList {
                    add(CATEGORIA_TODOS)
                    addAll(lista.mapNotNull { it.categoria?.trim()?.takeIf { s -> s.isNotEmpty() } }
                        .distinctBy { it.lowercase() }
                        .sorted())
                }
                _state.update { it.copy(loading = false, produtosTodos = lista, categorias = cats) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, erro = e.message ?: "Erro ao buscar produtos") }
            }
        }
    }

    @OptIn(FlowPreview::class)
    private fun observarBusca() {
        viewModelScope.launch {
            termoFlow.debounce(250).distinctUntilChanged().collect { carregar(it) }
        }
    }

    private fun observarCarrinho() {
        viewModelScope.launch {
            CartStore.items.collect { items ->
                _state.update {
                    it.copy(
                        itensNoCarrinho = items.sumOf { i -> i.quantidade },
                        totalCarrinho = items.sumOf { i -> i.subtotal }
                    )
                }
            }
        }
    }

    private fun observarScanner() {
        viewModelScope.launch {
            BarcodeScanner.scans.collect { codigo ->
                try {
                    val unidadeId = Prefs.unidadeId.first() ?: return@collect
                    val produto = ProdutosRepository.porCodigoBarras(unidadeId, codigo)
                    if (produto != null) {
                        if (deveVerificarIdade(produto)) {
                            AgeCheckGate.request(produto)
                        } else {
                            CartStore.add(produto)
                            _state.update { it.copy(aviso = "✓ ${produto.nome} · +1") }
                        }
                    } else {
                        runCatching { ProdutosRepository.registrarPendencia(unidadeId, codigo) }
                        _state.update { it.copy(aviso = "Código $codigo não está no planograma") }
                    }
                } catch (e: Exception) {
                    _state.update { it.copy(aviso = "Erro: ${e.message}") }
                }
            }
        }
    }
}
