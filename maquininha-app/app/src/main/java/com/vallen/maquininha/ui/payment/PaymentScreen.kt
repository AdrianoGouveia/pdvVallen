package com.vallen.maquininha.ui.payment

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.vallen.maquininha.plugpag.PagBankIntents
import com.vallen.maquininha.plugpag.PaymentKind

@Composable
fun PaymentScreen(
    onVoltar: () -> Unit,
    onFinalizado: (aprovado: Boolean, valor: Double, nsu: String) -> Unit,
    vm: PaymentViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activity = context as? Activity

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        vm.onResultadoIntent(result.resultCode, result.data)
    }

    LaunchedEffect(Unit) {
        vm.intents.collect { intent -> launcher.launch(intent) }
    }

    LaunchedEffect(state.stage) {
        (state.stage as? PaymentStage.Finalizado)?.let {
            onFinalizado(it.aprovado, it.valor, it.nsu)
        }
    }

    val onEscolha: (PaymentKind) -> Unit = { kind ->
        val disponivel = activity?.let(PagBankIntents::isAvailable) == true
        vm.escolher(kind, context, plugpagDisponivel = disponivel)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(onVoltar = onVoltar, processando = state.stage is PaymentStage.Processando)

        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                "Total",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "R$ ${"%.2f".format(state.total).replace('.', ',')}",
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 48.sp,
                fontWeight = FontWeight.Black
            )
            Spacer(Modifier.height(32.dp))

            state.erro?.let {
                Text(it, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                Spacer(Modifier.height(16.dp))
            }

            when (val stage = state.stage) {
                is PaymentStage.EscolhendoTipo -> TipoPagamento(onEscolha)
                is PaymentStage.Processando -> Processando(stage.mensagem, vm::cancelar)
                is PaymentStage.Finalizado -> Unit
            }
        }
    }
}

@Composable
private fun TopBar(onVoltar: () -> Unit, processando: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedButton(
            onClick = onVoltar,
            enabled = !processando,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp),
            modifier = Modifier.height(40.dp)
        ) { Text("←") }
        Spacer(Modifier.size(12.dp))
        Text(
            "Pagamento",
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun TipoPagamento(onEscolha: (PaymentKind) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            "Selecione o tipo de pagamento",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp
        )
        Spacer(Modifier.height(4.dp))
        BotaoPagamento("Crédito") { onEscolha(PaymentKind.CREDIT) }
        BotaoPagamento("Débito") { onEscolha(PaymentKind.DEBIT) }
        BotaoPagamento("PIX") { onEscolha(PaymentKind.PIX) }
    }
}

@Composable
private fun BotaoPagamento(texto: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(56.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary
        )
    ) { Text(texto, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun Processando(mensagem: String, onCancel: () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(20.dp))
            Text(
                mensagem,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 16.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            OutlinedButton(onClick = onCancel) { Text("Cancelar") }
        }
    }
}
