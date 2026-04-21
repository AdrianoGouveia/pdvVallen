package com.vallen.maquininha.ui.age

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vallen.maquininha.data.AgeCheckGate
import com.vallen.maquininha.data.CartStore
import com.vallen.maquininha.data.ClientesRepository
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.data.model.Cliente
import com.vallen.maquininha.ui.components.StatusBar
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.Period
import java.time.format.DateTimeFormatter

/**
 * Tela cheia de verificação de idade. Abre quando o usuário tenta adicionar
 * um produto com `restrito_idade=true` e o carrinho ainda não foi validado.
 *
 * Fluxo (espelha o totem web):
 *  1. Pede CPF + dia + mês → consulta `clientes`
 *  2a. Cliente existe → confirma dia/mês → aprova (ou nega se < 18)
 *  2b. Cliente novo  → abre modal com nome, ano e celular → cadastra e aprova
 *
 * Aprovar: adiciona o produto pendente ao carrinho + marca ageVerified.
 * Negar/Cancelar: dispara o banner vermelho no HomeScreen.
 */
@Composable
fun AgeVerificationScreen(onFechar: () -> Unit) {
    val pending by AgeCheckGate.pending.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    // Se por algum motivo entrar sem produto pendente, sai.
    LaunchedEffect(pending) {
        if (pending == null) onFechar()
    }

    var cpf by remember { mutableStateOf("") }
    var dia by remember { mutableStateOf("") }
    var mes by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }

    // Modal de novo cliente
    var showNovoCliente by remember { mutableStateOf(false) }

    val cancelar = {
        AgeCheckGate.deny()
        onFechar()
    }
    BackHandler(enabled = true) { cancelar() }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        StatusBar()

        // Cabeçalho
        Row(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFFF59E0B)),
                contentAlignment = Alignment.Center
            ) {
                Text("🔞", fontSize = 24.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "Verificação de idade",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    pending?.nome?.let { "Produto restrito: $it" } ?: "",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }
            Box(
                Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                    .clickable(onClick = cancelar),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Cancelar",
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "Venda permitida apenas para maiores de 18 anos.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))

            CampoTexto(
                label = "CPF (11 dígitos)",
                valor = cpf,
                onValor = { cpf = it.filter(Char::isDigit).take(11); erro = null },
                keyboard = KeyboardType.NumberPassword,
                placeholder = "000.000.000-00"
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CampoTexto(
                    label = "Dia",
                    valor = dia,
                    onValor = { dia = it.filter(Char::isDigit).take(2); erro = null },
                    keyboard = KeyboardType.Number,
                    placeholder = "DD",
                    modifier = Modifier.weight(1f)
                )
                CampoTexto(
                    label = "Mês",
                    valor = mes,
                    onValor = { mes = it.filter(Char::isDigit).take(2); erro = null },
                    keyboard = KeyboardType.Number,
                    placeholder = "MM",
                    modifier = Modifier.weight(1f)
                )
            }

            erro?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(Modifier.height(28.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Botao(
                    texto = "Cancelar",
                    onClick = cancelar,
                    primario = false,
                    modifier = Modifier.weight(1f)
                )
                Botao(
                    texto = if (loading) "Consultando…" else "Confirmar",
                    primario = true,
                    onClick = {
                        val cpfDigits = cpf
                        val d = dia.toIntOrNull()
                        val m = mes.toIntOrNull()
                        when {
                            cpfDigits.length != 11 -> erro = "Digite os 11 dígitos do CPF."
                            d == null || d !in 1..31 -> erro = "Dia inválido."
                            m == null || m !in 1..12 -> erro = "Mês inválido."
                            else -> {
                                erro = null
                                loading = true
                                scope.launch {
                                    val encontrado = runCatching {
                                        ClientesRepository.buscarPorCpf(cpfDigits)
                                    }.getOrNull()
                                    loading = false
                                    if (encontrado != null) {
                                        val ok = validarClienteExistente(encontrado, d, m)
                                        when (ok) {
                                            CheckResultado.APROVADO -> aprovar(onFechar)
                                            CheckResultado.MENOR_IDADE -> negar(onFechar)
                                            CheckResultado.DATA_NAO_CONFERE -> erro = "Data de nascimento não confere."
                                        }
                                    } else {
                                        showNovoCliente = true
                                    }
                                }
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    disabled = loading
                )
            }
        }
    }

    if (showNovoCliente) {
        NovoClienteModal(
            cpf = cpf,
            dia = dia.toInt(),
            mes = mes.toInt(),
            onCancelar = {
                showNovoCliente = false
                // Cancelar no modal = recusa: banner vermelho
                negar(onFechar)
            },
            onAprovadoECadastrado = {
                showNovoCliente = false
                aprovar(onFechar)
            },
            onMenorIdade = {
                showNovoCliente = false
                negar(onFechar)
            }
        )
    }
}

// ── Helpers de fluxo ─────────────────────────────────────────────────────────

private enum class CheckResultado { APROVADO, MENOR_IDADE, DATA_NAO_CONFERE }

private fun validarClienteExistente(c: Cliente, dia: Int, mes: Int): CheckResultado {
    val nasc = runCatching { LocalDate.parse(c.dataNascimento.substring(0, 10)) }
        .getOrNull() ?: return CheckResultado.DATA_NAO_CONFERE
    if (nasc.dayOfMonth != dia || nasc.monthValue != mes) return CheckResultado.DATA_NAO_CONFERE
    val idade = Period.between(nasc, LocalDate.now()).years
    return if (idade >= 18) CheckResultado.APROVADO else CheckResultado.MENOR_IDADE
}

private fun aprovar(onFechar: () -> Unit) {
    val p = AgeCheckGate.pending.value
    if (p != null) {
        CartStore.markAgeVerified()
        CartStore.add(p)
    }
    AgeCheckGate.consume()
    onFechar()
}

private fun negar(onFechar: () -> Unit) {
    AgeCheckGate.deny()
    onFechar()
}

// ── Componentes de UI ────────────────────────────────────────────────────────

@Composable
private fun CampoTexto(
    label: String,
    valor: String,
    onValor: (String) -> Unit,
    keyboard: KeyboardType,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    Column(modifier) {
        Text(
            label.uppercase(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.5.sp
        )
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = valor,
            onValueChange = onValor,
            placeholder = { Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(60.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                focusedTextColor = MaterialTheme.colorScheme.onBackground,
                unfocusedTextColor = MaterialTheme.colorScheme.onBackground,
                cursorColor = MaterialTheme.colorScheme.primary
            )
        )
    }
}

@Composable
private fun Botao(
    texto: String,
    onClick: () -> Unit,
    primario: Boolean,
    modifier: Modifier = Modifier,
    disabled: Boolean = false
) {
    val bg = when {
        disabled -> MaterialTheme.colorScheme.surfaceVariant
        primario -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val fg = when {
        disabled -> MaterialTheme.colorScheme.onSurfaceVariant
        primario -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurface
    }
    Box(
        modifier
            .height(60.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(bg)
            .then(
                if (!primario && !disabled)
                    Modifier.border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
                else Modifier
            )
            .clickable(enabled = !disabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            texto,
            color = fg,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

// ── Modal de cadastro de novo cliente ────────────────────────────────────────

@Composable
private fun NovoClienteModal(
    cpf: String,
    dia: Int,
    mes: Int,
    onCancelar: () -> Unit,
    onAprovadoECadastrado: () -> Unit,
    onMenorIdade: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var nome by remember { mutableStateOf("") }
    var ano by remember { mutableStateOf("") }
    var celular by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xCC000000))
            .clickable(enabled = false) {},
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(20.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
                .padding(20.dp)
        ) {
            Text(
                "Cadastro rápido",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Text(
                "CPF não encontrado. Preencha para continuar.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp
            )
            Spacer(Modifier.height(16.dp))

            CampoTexto(
                label = "Nome completo",
                valor = nome,
                onValor = { nome = it; erro = null },
                keyboard = KeyboardType.Text,
                placeholder = "Nome"
            )
            Spacer(Modifier.height(12.dp))
            CampoTexto(
                label = "Ano de nascimento",
                valor = ano,
                onValor = { ano = it.filter(Char::isDigit).take(4); erro = null },
                keyboard = KeyboardType.Number,
                placeholder = "AAAA"
            )
            Spacer(Modifier.height(12.dp))
            CampoTexto(
                label = "Celular",
                valor = celular,
                onValor = { celular = it.filter(Char::isDigit).take(11); erro = null },
                keyboard = KeyboardType.Phone,
                placeholder = "(DD) 9XXXXXXXX"
            )

            erro?.let {
                Spacer(Modifier.height(10.dp))
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Botao(
                    texto = "Cancelar",
                    primario = false,
                    onClick = onCancelar,
                    modifier = Modifier.weight(1f),
                    disabled = saving
                )
                Botao(
                    texto = if (saving) "Salvando…" else "Confirmar",
                    primario = true,
                    disabled = saving,
                    onClick = submit@{
                        val anoN = ano.toIntOrNull()
                        if (nome.trim().length < 3) { erro = "Nome obrigatório."; return@submit }
                        if (anoN == null || anoN < 1900 || anoN > LocalDate.now().year) {
                            erro = "Ano inválido."; return@submit
                        }
                        if (celular.length < 10) { erro = "Celular inválido."; return@submit }

                        val data = runCatching { LocalDate.of(anoN, mes, dia) }.getOrNull()
                        if (data == null) { erro = "Data inválida."; return@submit }
                        val idade = Period.between(data, LocalDate.now()).years
                        if (idade < 18) { onMenorIdade(); return@submit }

                        saving = true
                        scope.launch {
                            val unidadeId = runCatching { Prefs.unidadeId.first() }.getOrNull()
                            val res = runCatching {
                                ClientesRepository.cadastrar(
                                    cpf = cpf,
                                    nome = nome,
                                    dataNascimentoIso = data.format(DateTimeFormatter.ISO_LOCAL_DATE),
                                    telefone = celular,
                                    unidadeId = unidadeId
                                )
                            }
                            saving = false
                            if (res.isSuccess) onAprovadoECadastrado()
                            else erro = "Erro ao salvar: ${res.exceptionOrNull()?.message}"
                        }
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}
