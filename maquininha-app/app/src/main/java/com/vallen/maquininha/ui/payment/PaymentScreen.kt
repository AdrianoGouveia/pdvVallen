package com.vallen.maquininha.ui.payment

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Contactless
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.vallen.maquininha.plugpag.PagBankIntents
import com.vallen.maquininha.plugpag.PaymentKind
import com.vallen.maquininha.ui.components.PosHeader
import com.vallen.maquininha.ui.components.StatusBar

@Composable
fun PaymentScreen(
    onVoltar: () -> Unit,
    onFinalizado: (aprovado: Boolean, valor: Double, nsu: String) -> Unit,
    metodoInicial: PaymentKind? = null,
    onCancelar: (() -> Unit)? = null,
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

    LaunchedEffect(metodoInicial) {
        if (metodoInicial != null && state.stage is PaymentStage.EscolhendoTipo) {
            val disponivel = activity?.let(PagBankIntents::isAvailable) == true
            vm.escolher(metodoInicial, context, plugpagDisponivel = disponivel)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        StatusBar()
        PosHeader(
            title = "Pagamento",
            onBack = if (state.stage !is PaymentStage.Processando) onVoltar else null,
            onCancel = onCancelar
        )

        Column(
            Modifier
                .fillMaxSize()
                .weight(1f)
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(12.dp))
            Text(
                "TOTAL",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 4.sp
            )
            Spacer(Modifier.height(4.dp))
            Text(
                formatarReal(state.total),
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 52.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-1.5).sp
            )

            Spacer(Modifier.height(40.dp))

            Box(
                Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                when (val stage = state.stage) {
                    is PaymentStage.EscolhendoTipo ->
                        AguardandoSelecao()
                    is PaymentStage.Processando ->
                        NfcAguardando(metodo = metodoInicial, mensagem = stage.mensagem)
                    is PaymentStage.Finalizado ->
                        if (stage.aprovado) Aprovado() else Recusado(stage.motivo)
                }
            }

            state.erro?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        RodapePagando(metodo = metodoInicial)
    }
}

@Composable
private fun NfcAguardando(metodo: PaymentKind?, mensagem: String) {
    val isPix = metodo == PaymentKind.PIX
    val processandoIntenso = mensagem.contains("processando", ignoreCase = true) ||
        mensagem.contains("confirmando", ignoreCase = true)

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        if (processandoIntenso) {
            CircularProgressIndicator(
                color = MaterialTheme.colorScheme.primary,
                strokeWidth = 5.dp,
                modifier = Modifier.size(120.dp)
            )
            Spacer(Modifier.height(32.dp))
            Text(
                "Processando pagamento…",
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Não retire o cartão.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp
            )
        } else {
            NfcOndas(isPix = isPix)
            Spacer(Modifier.height(32.dp))
            Text(
                if (isPix) "Escaneie o QR Code" else "Aproxime, insira ou passe o cartão",
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(8.dp))
            Text(
                if (isPix) "Use o app do seu banco para pagar." else mensagem.ifBlank { "Aguardando leitura…" },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun NfcOndas(isPix: Boolean) {
    val transition = rememberInfiniteTransition(label = "nfc")
    val w1 by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing)),
        label = "w1"
    )
    val w2 by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing), initialStartOffset = androidx.compose.animation.core.StartOffset(800)),
        label = "w2"
    )

    Box(
        Modifier.size(240.dp),
        contentAlignment = Alignment.Center
    ) {
        Onda(progress = w1)
        Onda(progress = w2)
        Box(
            Modifier
                .size(150.dp)
                .clip(RoundedCornerShape(32.dp))
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = if (isPix) Icons.Filled.QrCode else Icons.Filled.Contactless,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(90.dp)
            )
        }
    }
}

@Composable
private fun Onda(progress: Float) {
    val escala = 0.6f + progress * 1.0f
    val alpha = (1f - progress).coerceIn(0f, 1f)
    Box(
        Modifier
            .size(240.dp)
            .graphicsLayer {
                scaleX = escala
                scaleY = escala
                this.alpha = alpha
            }
            .border(3.dp, MaterialTheme.colorScheme.primary, CircleShape)
    )
}

@Composable
private fun AguardandoSelecao() {
    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
}

@Composable
private fun Aprovado() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(140.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.tertiary),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onTertiary,
                modifier = Modifier.size(80.dp)
            )
        }
        Spacer(Modifier.height(28.dp))
        Text(
            "Pagamento aprovado!",
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 26.sp,
            fontWeight = FontWeight.ExtraBold
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Retire seu comprovante. Obrigado!",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 14.sp
        )
    }
}

@Composable
private fun Recusado(motivo: String?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            "Pagamento não aprovado",
            color = MaterialTheme.colorScheme.error,
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold
        )
        if (!motivo.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(
                motivo,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun RodapePagando(metodo: PaymentKind?) {
    val (icone, texto) = when (metodo) {
        PaymentKind.CREDIT -> Icons.Filled.CreditCard to "Pagando com crédito"
        PaymentKind.DEBIT  -> Icons.Filled.CreditCard to "Pagando com débito"
        PaymentKind.PIX    -> Icons.Filled.QrCode to "Pagando com PIX"
        null               -> Icons.Filled.CreditCard to "Pagando"
    }
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            icone as ImageVector,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp)
        )
        Spacer(Modifier.size(8.dp))
        Text(
            texto.uppercase(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 3.sp
        )
    }
}

private fun formatarReal(v: Double): String =
    "R$ ${"%.2f".format(v).replace('.', ',')}"
