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
import com.vallen.maquininha.data.model.Franqueado
import kotlinx.coroutines.launch

@Composable
fun SelectFranqueadoScreen(onEscolhido: () -> Unit) {
    var loading by remember { mutableStateOf(true) }
    var erro by remember { mutableStateOf<String?>(null) }
    var lista by remember { mutableStateOf<List<Franqueado>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            val franqs = AuthRepository.listarFranqueadosDoUsuario()
            lista = franqs
            if (franqs.size == 1) {
                val f = franqs.first()
                Prefs.saveFranqueado(f.id, f.nomeFantasia ?: f.razaoSocial)
                onEscolhido()
                return@LaunchedEffect
            }
            loading = false
        } catch (e: Exception) {
            erro = e.message ?: "Erro ao carregar franqueados"
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
            "SELECIONE O CNPJ",
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
            items(lista) { f ->
                Card(
                    onClick = {
                        scope.launch {
                            Prefs.saveFranqueado(f.id, f.nomeFantasia ?: f.razaoSocial)
                            onEscolhido()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            f.nomeFantasia ?: f.razaoSocial,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "${f.tipoDoc} ${f.documento}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}
