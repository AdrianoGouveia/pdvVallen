package com.vallen.maquininha.ui.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Easter egg: 5 toques no logo Vallen dentro de 2,5s abrem a tela de configurações.
 * Estado global observável por Compose.
 */
object SettingsEasterEgg {
    private const val JANELA_MS = 2500L
    private const val TOQUES_NECESSARIOS = 5

    private val cliques = mutableStateListOf<Long>()

    var visivel by mutableStateOf(false)
        private set

    fun tap() {
        val agora = System.currentTimeMillis()
        cliques.removeAll { agora - it > JANELA_MS }
        cliques.add(agora)
        if (cliques.size >= TOQUES_NECESSARIOS) {
            cliques.clear()
            visivel = true
        }
    }

    fun fechar() {
        visivel = false
    }
}
