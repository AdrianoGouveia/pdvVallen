package com.vallen.maquininha.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vallen.maquininha.data.AuthRepository
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.data.model.Unidade
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun SelectUnidadeScreen(onEscolhida: () -> Unit) {
    var loading by remember { mutableStateOf(true) }
    var erro by remember { mutableStateOf<String?>(null) }
    var lista by remember { mutableStateOf<List<Unidade>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            val franqueadoId = Prefs.franqueadoId.first()
                ?: throw IllegalStateException("Franqueado não selecionado")
            val unidades = AuthRepository.listarUnidadesDoFranqueado(franqueadoId)
            lista = unidades
            if (unidades.size == 1) {
                val u = unidades.first()
                Prefs.saveUnidade(u.id, u.nome)
                onEscolhida()
                return@LaunchedEffect
            }
            loading = false
        } catch (e: Exception) {
            erro = e.message ?: "Erro ao carregar filiais"
            loading = false
        }
    }

    if (loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
        return
    }

    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text(
            "SELECIONE A FILIAL",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp
        )
        Spacer(Modifier.height(16.dp))
        erro?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
            return@Column
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(lista) { u ->
                Card(
                    onClick = {
                        scope.launch {
                            Prefs.saveUnidade(u.id, u.nome)
                            onEscolhida()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Text(
                        u.nome,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }
    }
}
