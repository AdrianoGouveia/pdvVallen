package com.vallen.maquininha.ui.result

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vallen.maquininha.ui.theme.VallenError
import com.vallen.maquininha.ui.theme.VallenSuccess
import kotlinx.coroutines.delay

@Composable
fun ResultScreen(
    aprovado: Boolean,
    valor: Double,
    nsu: String,
    onVoltar: () -> Unit
) {
    LaunchedEffect(Unit) {
        delay(5000)
        onVoltar()
    }

    val cor = if (aprovado) VallenSuccess else VallenError
    val icone = if (aprovado) "✓" else "✕"
    val titulo = if (aprovado) "Pagamento aprovado" else "Pagamento recusado"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .clickable { onVoltar() }
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier.size(120.dp).clip(CircleShape).background(cor),
            contentAlignment = Alignment.Center
        ) {
            Text(icone, color = Color.White, fontSize = 72.sp, fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(32.dp))
        Text(
            titulo,
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 24.sp,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "R$ ${"%.2f".format(valor).replace('.', ',')}",
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 40.sp,
            fontWeight = FontWeight.Black
        )
        if (aprovado && nsu.isNotBlank() && nsu != "-") {
            Spacer(Modifier.height(12.dp))
            Text(
                "NSU $nsu",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp
            )
        }
        Spacer(Modifier.height(40.dp))
        Text(
            "Toque para voltar",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp
        )
    }
}
