package com.vallen.maquininha.ui.pendencias

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vallen.maquininha.data.PendenciasRepository
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.data.model.CategoriaSimples
import com.vallen.maquininha.data.model.PendenciaItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PendenciasState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val itens: List<PendenciaItem> = emptyList(),
    val categorias: List<CategoriaSimples> = emptyList(),
    val erro: String? = null,
    val mensagem: String? = null,
    val editando: PendenciaItem? = null,
    val salvando: Boolean = false
)

class PendenciasViewModel : ViewModel() {

    private val _state = MutableStateFlow(PendenciasState())
    val state: StateFlow<PendenciasState> = _state.asStateFlow()

    init { recarregar() }

    fun recarregar() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, erro = null) }
            runCatching {
                val unidade = Prefs.unidadeId.first()
                    ?: error("Unidade não configurada")
                val itens = PendenciasRepository.listar(unidade)
                val cats = PendenciasRepository.listarCategorias(unidade)
                _state.update {
                    it.copy(loading = false, itens = itens, categorias = cats)
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(loading = false, erro = e.message ?: "Falha ao carregar pendências")
                }
            }
        }
    }

    fun abrir(item: PendenciaItem) {
        _state.update { it.copy(editando = item) }
    }

    fun fecharEdicao() {
        _state.update { it.copy(editando = null, erro = null) }
    }

    fun limparMensagem() {
        _state.update { it.copy(mensagem = null) }
    }

    /**
     * Resolve uma pendência de produto já cadastrado: adiciona ao planograma.
     */
    fun adicionarAoPlanograma(
        produtoId: Long,
        precoVenda: Double,
        quantidade: Int?,
        controlaEstoque: Boolean
    ) {
        viewModelScope.launch {
            _state.update { it.copy(salvando = true, erro = null) }
            runCatching {
                val unidade = Prefs.unidadeId.first() ?: error("Unidade não configurada")
                PendenciasRepository.adicionarAoPlanograma(
                    unidadeId = unidade,
                    produtoId = produtoId,
                    precoVenda = precoVenda,
                    quantidade = quantidade,
                    controlaEstoque = controlaEstoque
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        salvando = false,
                        editando = null,
                        mensagem = "Produto adicionado ao planograma"
                    )
                }
                recarregar()
            }.onFailure { e ->
                _state.update {
                    it.copy(salvando = false, erro = e.message ?: "Falha ao adicionar")
                }
            }
        }
    }

    /**
     * Cadastra produto novo no catálogo + planograma. Se `fotoUri` informado,
     * faz upload para o Storage antes.
     */
    fun cadastrarProduto(
        context: Context,
        codigoBarras: String,
        nome: String,
        precoVenda: Double,
        categoria: String?,
        emoji: String?,
        fotoUri: Uri?,
        restritoIdade: Boolean,
        quantidade: Int?,
        controlaEstoque: Boolean
    ) {
        viewModelScope.launch {
            _state.update { it.copy(salvando = true, erro = null) }
            runCatching {
                val unidade = Prefs.unidadeId.first() ?: error("Unidade não configurada")
                val imagemUrl = fotoUri?.let { uri ->
                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: error("Não foi possível ler a foto")
                    PendenciasRepository.uploadFoto(unidade, codigoBarras, bytes)
                }
                PendenciasRepository.cadastrarProduto(
                    unidadeId = unidade,
                    codigoBarras = codigoBarras,
                    nome = nome,
                    precoVenda = precoVenda,
                    categoria = categoria,
                    emoji = emoji,
                    imagemUrl = imagemUrl,
                    restritoIdade = restritoIdade,
                    quantidade = quantidade,
                    controlaEstoque = controlaEstoque
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        salvando = false,
                        editando = null,
                        mensagem = "Produto cadastrado"
                    )
                }
                recarregar()
            }.onFailure { e ->
                _state.update {
                    it.copy(salvando = false, erro = e.message ?: "Falha ao cadastrar")
                }
            }
        }
    }
}
