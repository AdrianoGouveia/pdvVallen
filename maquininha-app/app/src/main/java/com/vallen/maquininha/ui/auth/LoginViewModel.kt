package com.vallen.maquininha.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vallen.maquininha.data.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val loading: Boolean = false,
    val erro: String? = null,
    val logadoComSucesso: Boolean = false
)

class LoginViewModel : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun login(email: String, senha: String) {
        if (_state.value.loading) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, erro = null) }
            try {
                AuthRepository.login(email, senha)
                _state.update { it.copy(loading = false, logadoComSucesso = true) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        erro = e.message?.take(120) ?: "Credenciais inválidas"
                    )
                }
            }
        }
    }
}
