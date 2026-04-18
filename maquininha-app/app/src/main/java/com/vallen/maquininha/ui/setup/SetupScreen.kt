package com.vallen.maquininha.ui.setup

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.vallen.maquininha.ui.components.VallenLogo

@Composable
fun SetupScreen(
    onDone: () -> Unit,
    vm: SetupViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.concluido) { if (state.concluido) onDone() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        VallenLogo(fontSize = 36)
        Spacer(Modifier.height(8.dp))
        Text(
            "Configuração do terminal",
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 18.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(Modifier.height(24.dp))

        when {
            state.loading -> Loading()
            state.erro != null -> ErrorBox(state.erro!!)
            else -> ListaTerminais(state, vm)
        }
    }
}

@Composable
private fun Loading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun ErrorBox(msg: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Text(msg, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
    }
}

@Composable
private fun ListaTerminais(state: SetupUiState, vm: SetupViewModel) {
    var novoNome by remember { mutableStateOf("") }

    Text(
        "Unidade: ${state.unidadeNome}",
        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp
    )
    Spacer(Modifier.height(16.dp))

    if (state.terminais.isNotEmpty()) {
        Text("Terminais existentes:", color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(8.dp))
        state.terminais.forEach { t ->
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                onClick = { vm.usarTerminal(t) }
            ) {
                Text(t.nome, modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurface)
            }
        }
        Spacer(Modifier.height(24.dp))
        Text("— ou —", color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Spacer(Modifier.height(16.dp))
    }

    Text("Cadastrar novo terminal:", color = MaterialTheme.colorScheme.onBackground)
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = novoNome,
        onValueChange = { novoNome = it },
        label = { Text("Nome (ex: Caixa 01)") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
    Spacer(Modifier.height(12.dp))
    Button(
        onClick = { vm.criarNovoTerminal(novoNome) },
        enabled = novoNome.isNotBlank() && !state.salvando,
        modifier = Modifier.fillMaxWidth()
    ) { Text(if (state.salvando) "Salvando..." else "Criar e usar") }
}
