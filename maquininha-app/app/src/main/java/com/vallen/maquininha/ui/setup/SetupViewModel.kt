package com.vallen.maquininha.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vallen.maquininha.data.PedidosRepository
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.data.model.NovoTerminal
import com.vallen.maquininha.data.model.Terminal
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SetupUiState(
    val loading: Boolean = true,
    val unidadeId: Long? = null,
    val unidadeNome: String = "",
    val terminais: List<Terminal> = emptyList(),
    val erro: String? = null,
    val salvando: Boolean = false,
    val concluido: Boolean = false
)

class SetupViewModel : ViewModel() {
    private val _state = MutableStateFlow(SetupUiState())
    val state: StateFlow<SetupUiState> = _state.asStateFlow()

    init { carregar() }

    private fun carregar() {
        viewModelScope.launch {
            try {
                val unidadeId = Prefs.unidadeId.first()
                    ?: throw IllegalStateException("Unidade não selecionada")
                val unidadeNome = Prefs.unidadeNome.first().orEmpty()
                val terminais = PedidosRepository.listarTerminais(unidadeId)
                _state.update {
                    it.copy(
                        loading = false,
                        unidadeId = unidadeId,
                        unidadeNome = unidadeNome,
                        terminais = terminais
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, erro = e.message ?: "Erro ao carregar terminais") }
            }
        }
    }

    fun usarTerminal(terminal: Terminal) {
        viewModelScope.launch {
            _state.update { it.copy(salvando = true) }
            Prefs.saveTerminal(terminal.id, terminal.nome)
            _state.update { it.copy(salvando = false, concluido = true) }
        }
    }

    fun criarNovoTerminal(nome: String) {
        val unidadeId = _state.value.unidadeId ?: return
        if (nome.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(salvando = true, erro = null) }
            try {
                val novo = PedidosRepository.criarTerminal(
                    NovoTerminal(unidadeId = unidadeId, nome = nome.trim())
                )
                Prefs.saveTerminal(novo.id, novo.nome)
                _state.update { it.copy(salvando = false, concluido = true) }
            } catch (e: Exception) {
                _state.update { it.copy(salvando = false, erro = e.message ?: "Erro ao criar terminal") }
            }
        }
    }
}
