package com.vallen.maquininha.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "vallen_prefs")

object Prefs {
    private val KEY_FRANQUEADO_ID = longPreferencesKey("franqueado_id")
    private val KEY_FRANQUEADO_NOME = stringPreferencesKey("franqueado_nome")
    private val KEY_TERMINAL_ID = longPreferencesKey("terminal_id")
    private val KEY_TERMINAL_NOME = stringPreferencesKey("terminal_nome")
    private val KEY_UNIDADE_ID = longPreferencesKey("unidade_id")
    private val KEY_UNIDADE_NOME = stringPreferencesKey("unidade_nome")
    private val KEY_AGE_CHECK = booleanPreferencesKey("age_check_enabled")

    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    val franqueadoId: Flow<Long?> get() = get { it[KEY_FRANQUEADO_ID] }
    val franqueadoNome: Flow<String?> get() = get { it[KEY_FRANQUEADO_NOME] }
    val terminalId: Flow<Long?> get() = get { it[KEY_TERMINAL_ID] }
    val terminalNome: Flow<String?> get() = get { it[KEY_TERMINAL_NOME] }
    val unidadeId: Flow<Long?> get() = get { it[KEY_UNIDADE_ID] }
    val unidadeNome: Flow<String?> get() = get { it[KEY_UNIDADE_NOME] }
    // Default habilitado; operador pode desligar em Configurações
    val ageCheckEnabled: Flow<Boolean> get() = appContext.dataStore.data.map { it[KEY_AGE_CHECK] ?: true }

    suspend fun setAgeCheckEnabled(enabled: Boolean) {
        appContext.dataStore.edit { p -> p[KEY_AGE_CHECK] = enabled }
    }

    suspend fun saveFranqueado(id: Long, nome: String) {
        appContext.dataStore.edit { p ->
            p[KEY_FRANQUEADO_ID] = id
            p[KEY_FRANQUEADO_NOME] = nome
        }
    }

    suspend fun saveUnidade(id: Long, nome: String) {
        appContext.dataStore.edit { p ->
            p[KEY_UNIDADE_ID] = id
            p[KEY_UNIDADE_NOME] = nome
        }
    }

    suspend fun saveTerminal(id: Long, nome: String) {
        appContext.dataStore.edit { p ->
            p[KEY_TERMINAL_ID] = id
            p[KEY_TERMINAL_NOME] = nome
        }
    }

    suspend fun clear() {
        appContext.dataStore.edit { it.clear() }
    }

    suspend fun clearTerminal() {
        appContext.dataStore.edit { p ->
            p.remove(KEY_TERMINAL_ID)
            p.remove(KEY_TERMINAL_NOME)
        }
    }

    suspend fun clearUnidade() {
        appContext.dataStore.edit { p ->
            p.remove(KEY_TERMINAL_ID)
            p.remove(KEY_TERMINAL_NOME)
            p.remove(KEY_UNIDADE_ID)
            p.remove(KEY_UNIDADE_NOME)
        }
    }

    private fun <T> get(block: (Preferences) -> T?): Flow<T?> =
        appContext.dataStore.data.map { block(it) }
}
