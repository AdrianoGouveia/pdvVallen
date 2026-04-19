package com.vallen.maquininha.ui.settings

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vallen.maquininha.BuildConfig
import com.vallen.maquininha.data.AuthRepository
import com.vallen.maquininha.data.CartStore
import com.vallen.maquininha.data.Prefs
import kotlinx.coroutines.launch

private const val SENHA_TECNICO = "1234"

@Composable
fun SettingsScreen(
    onClose: () -> Unit,
    onLogout: () -> Unit,
    onTrocarUnidade: () -> Unit,
    onReconfigurarTerminal: () -> Unit
) {
    var autenticado by remember { mutableStateOf(false) }

    val bgInteraction = remember { MutableInteractionSource() }
    val cardInteraction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xCC000000))
            .clickable(indication = null, interactionSource = bgInteraction) { onClose() },
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier
                .widthIn(max = 420.dp)
                .padding(20.dp)
                .clip(RoundedCornerShape(28.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(28.dp))
                .clickable(indication = null, interactionSource = cardInteraction) { /* swallow */ }
        ) {
            Header(autenticado = autenticado, onClose = onClose)

            if (!autenticado) {
                SenhaForm(onValidar = { autenticado = true }, onCancelar = onClose)
            } else {
                Acoes(
                    onTrocarUnidade = onTrocarUnidade,
                    onReconfigurarTerminal = onReconfigurarTerminal,
                    onLogout = onLogout,
                    onClose = onClose
                )
            }
        }
    }
}

@Composable
private fun Header(autenticado: Boolean, onClose: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(20.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.Settings,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                "Configurações",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.5).sp
            )
            Text(
                if (autenticado) "Acesso técnico autorizado" else "Área restrita",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp
            )
        }
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(onClick = onClose),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = "Fechar",
                tint = MaterialTheme.colorScheme.onSurface
            )
        }
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outline)
    )
}

@Composable
private fun SenhaForm(onValidar: () -> Unit, onCancelar: () -> Unit) {
    var senha by remember { mutableStateOf("") }
    var erro by remember { mutableStateOf(false) }

    val validar = {
        if (senha == SENHA_TECNICO) {
            erro = false
            onValidar()
        } else {
            erro = true
            senha = ""
        }
    }

    Column(Modifier.padding(20.dp)) {
        Text(
            "Senha do técnico",
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = senha,
            onValueChange = { senha = it; erro = false },
            placeholder = { Text("••••", color = MaterialTheme.colorScheme.onSurfaceVariant) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth().height(60.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = if (erro) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = if (erro) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                focusedTextColor = MaterialTheme.colorScheme.onBackground,
                unfocusedTextColor = MaterialTheme.colorScheme.onBackground,
                cursorColor = MaterialTheme.colorScheme.primary
            )
        )
        if (erro) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Senha incorreta. Tente novamente.",
                color = MaterialTheme.colorScheme.error,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        }
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BotaoSecundario(
                texto = "Voltar",
                onClick = onCancelar,
                modifier = Modifier.weight(1f)
            )
            BotaoPrimario(
                texto = "Entrar",
                onClick = validar,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun Acoes(
    onTrocarUnidade: () -> Unit,
    onReconfigurarTerminal: () -> Unit,
    onLogout: () -> Unit,
    onClose: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val terminalNome by Prefs.terminalNome.collectAsStateWithLifecycle(initialValue = null)
    val unidadeNome by Prefs.unidadeNome.collectAsStateWithLifecycle(initialValue = null)

    Column(Modifier.padding(20.dp)) {
        InfoLinha("Terminal", terminalNome ?: "—")
        Spacer(Modifier.height(6.dp))
        InfoLinha("Unidade", unidadeNome ?: "—")
        Spacer(Modifier.height(6.dp))
        InfoLinha("Versão", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")

        Spacer(Modifier.height(20.dp))

        AcaoItem(
            icon = Icons.Filled.Storefront,
            titulo = "Trocar unidade",
            subtitulo = "Escolher outra loja desta franquia",
            onClick = {
                scope.launch {
                    CartStore.clear()
                    Prefs.clearUnidade()
                    onTrocarUnidade()
                }
            }
        )
        Spacer(Modifier.height(8.dp))
        AcaoItem(
            icon = Icons.Filled.Refresh,
            titulo = "Reconfigurar terminal",
            subtitulo = "Reassociar esta maquininha",
            onClick = {
                scope.launch {
                    CartStore.clear()
                    Prefs.clearTerminal()
                    onReconfigurarTerminal()
                }
            }
        )
        Spacer(Modifier.height(8.dp))
        AcaoItem(
            icon = Icons.AutoMirrored.Filled.Logout,
            titulo = "Sair",
            subtitulo = "Encerrar sessão deste dispositivo",
            destaqueErro = true,
            onClick = {
                scope.launch {
                    CartStore.clear()
                    AuthRepository.logout()
                    Prefs.clear()
                    onLogout()
                }
            }
        )

        Spacer(Modifier.height(20.dp))
        BotaoSecundario(texto = "Fechar", onClick = onClose, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        Text(
            "Vallen Market · Maquininha",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
            modifier = Modifier.fillMaxWidth(),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
    }
}

@Composable
private fun InfoLinha(label: String, valor: String) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            label.uppercase(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 2.sp
        )
        Text(
            valor,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun AcaoItem(
    icon: ImageVector,
    titulo: String,
    subtitulo: String,
    destaqueErro: Boolean = false,
    onClick: () -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(
                    if (destaqueErro) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (destaqueErro) MaterialTheme.colorScheme.onError else MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(20.dp)
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                titulo,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                subtitulo,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.ArrowForward,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun BotaoPrimario(texto: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.primary)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            texto,
            color = MaterialTheme.colorScheme.onPrimary,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

@Composable
private fun BotaoSecundario(texto: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            texto,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

