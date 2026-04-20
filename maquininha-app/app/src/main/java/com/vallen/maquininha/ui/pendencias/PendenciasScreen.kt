package com.vallen.maquininha.ui.pendencias

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.vallen.maquininha.data.model.CategoriaSimples
import com.vallen.maquininha.data.model.PendenciaItem
import com.vallen.maquininha.ui.components.PosHeader
import com.vallen.maquininha.ui.components.StatusBar
import kotlinx.coroutines.delay

@Composable
fun PendenciasScreen(
    onVoltar: () -> Unit,
    vm: PendenciasViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(state.mensagem) {
        if (state.mensagem != null) { delay(2000); vm.limparMensagem() }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        StatusBar()
        PosHeader(
            title = "Pendências",
            onBack = onVoltar,
            trailing = {
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { vm.recarregar() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Filled.Refresh,
                        contentDescription = "Recarregar",
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        )

        Box(Modifier.fillMaxSize().weight(1f)) {
            when {
                state.loading -> CircularProgressIndicator(
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.align(Alignment.Center)
                )
                state.erro != null && state.itens.isEmpty() -> ErroVazio(state.erro!!)
                state.itens.isEmpty() -> TudoEmDia()
                else -> Conteudo(
                    itens = state.itens,
                    onAbrir = vm::abrir
                )
            }

            state.mensagem?.let { msg ->
                Toast(
                    text = msg,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 20.dp, start = 12.dp, end = 12.dp)
                )
            }
        }
    }

    state.editando?.let { item ->
        EditarPendenciaDialog(
            item = item,
            categorias = state.categorias,
            salvando = state.salvando,
            erro = state.erro,
            onClose = vm::fecharEdicao,
            onAdicionar = { preco, qtd, controla ->
                vm.adicionarAoPlanograma(
                    produtoId = item.produtoId!!,
                    precoVenda = preco,
                    quantidade = qtd,
                    controlaEstoque = controla
                )
            },
            onCadastrar = { nome, preco, categoria, emoji, foto, restrito, qtd, controla ->
                vm.cadastrarProduto(
                    context = context,
                    codigoBarras = item.codigoBarras,
                    nome = nome,
                    precoVenda = preco,
                    categoria = categoria,
                    emoji = emoji,
                    fotoUri = foto,
                    restritoIdade = restrito,
                    quantidade = qtd,
                    controlaEstoque = controla
                )
            }
        )
    }
}

@Composable
private fun TudoEmDia() {
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("✨", fontSize = 64.sp)
        Spacer(Modifier.height(16.dp))
        Text(
            "Nenhuma pendência",
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 18.sp,
            fontWeight = FontWeight.ExtraBold
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Todos os códigos lidos estão no planograma.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 36.dp)
        )
    }
}

@Composable
private fun ErroVazio(msg: String) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("⚠️", fontSize = 48.sp)
        Spacer(Modifier.height(12.dp))
        Text(
            msg,
            color = MaterialTheme.colorScheme.error,
            fontSize = 13.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun Conteudo(
    itens: List<PendenciaItem>,
    onAbrir: (PendenciaItem) -> Unit
) {
    val cadastrados = itens.filter { it.produtoCadastrado }
    val desconhecidos = itens.filter { !it.produtoCadastrado }

    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (cadastrados.isNotEmpty()) {
            item {
                SectionHeader(
                    icon = Icons.Filled.Inventory2,
                    titulo = "No catálogo — faltam no planograma",
                    subtitulo = "Produtos já cadastrados; só definir preço."
                )
            }
            items(cadastrados, key = { it.id }) { p ->
                PendenciaCadastradoCard(item = p, onClick = { onAbrir(p) })
            }
        }

        if (desconhecidos.isNotEmpty()) {
            item {
                Spacer(Modifier.height(8.dp))
                SectionHeader(
                    icon = Icons.AutoMirrored.Filled.HelpOutline,
                    titulo = "Códigos desconhecidos",
                    subtitulo = "Clique para cadastrar o produto novo."
                )
            }
            items(desconhecidos, key = { it.id }) { p ->
                PendenciaDesconhecidaCard(item = p, onClick = { onAbrir(p) })
            }
        }
    }
}

@Composable
private fun SectionHeader(icon: ImageVector, titulo: String, subtitulo: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
        Box(
            Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                titulo,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.3.sp
            )
            Text(
                subtitulo,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
private fun PendenciaCadastradoCard(item: PendenciaItem, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Text(item.produtoEmoji ?: "📦", fontSize = 28.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.produtoNome.orEmpty(),
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 17.sp
            )
            Spacer(Modifier.height(3.dp))
            Text(
                item.codigoBarras,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp
            )
            item.produtoCategoria?.let {
                Spacer(Modifier.height(3.dp))
                Text(
                    it.uppercase(),
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.5.sp
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        TentativasBadge(item.tentativas)
    }
}

@Composable
private fun PendenciaDesconhecidaCard(item: PendenciaItem, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.QrCode2,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(28.dp)
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.codigoBarras,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.5.sp
            )
            Spacer(Modifier.height(3.dp))
            Text(
                "Toque para cadastrar",
                color = MaterialTheme.colorScheme.primary,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
        Spacer(Modifier.width(8.dp))
        TentativasBadge(item.tentativas)
    }
}

@Composable
private fun TentativasBadge(n: Int) {
    Box(
        Modifier
            .heightIn(min = 26.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "${n}x",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun Toast(text: String, modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(12.dp),
        shadowElevation = 6.dp,
        modifier = modifier
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

// ============================================================
// Dialog de edição / cadastro
// ============================================================

@Composable
private fun EditarPendenciaDialog(
    item: PendenciaItem,
    categorias: List<CategoriaSimples>,
    salvando: Boolean,
    erro: String?,
    onClose: () -> Unit,
    onAdicionar: (preco: Double, qtd: Int?, controlaEstoque: Boolean) -> Unit,
    onCadastrar: (
        nome: String,
        preco: Double,
        categoria: String?,
        emoji: String?,
        foto: Uri?,
        restritoIdade: Boolean,
        qtd: Int?,
        controlaEstoque: Boolean
    ) -> Unit
) {
    val bgInteraction = remember { MutableInteractionSource() }
    val cardInteraction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xCC000000))
            .clickable(indication = null, interactionSource = bgInteraction) { if (!salvando) onClose() },
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier
                .widthIn(max = 460.dp)
                .fillMaxWidth()
                .padding(16.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
                .clickable(indication = null, interactionSource = cardInteraction) { /* swallow */ }
        ) {
            DialogHeader(
                titulo = if (item.produtoCadastrado) "Adicionar ao planograma" else "Cadastrar produto",
                subtitulo = item.codigoBarras,
                onClose = { if (!salvando) onClose() }
            )
            Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))

            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp)
            ) {
                if (item.produtoCadastrado) {
                    FormularioAdicionar(
                        item = item,
                        salvando = salvando,
                        onConfirmar = onAdicionar
                    )
                } else {
                    FormularioCadastrar(
                        codigoBarras = item.codigoBarras,
                        categorias = categorias,
                        salvando = salvando,
                        onConfirmar = onCadastrar
                    )
                }

                erro?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun DialogHeader(titulo: String, subtitulo: String, onClose: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                titulo,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Text(
                subtitulo,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp
            )
        }
        Box(
            Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(onClick = onClose),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Filled.Close, contentDescription = "Fechar", tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun FormularioAdicionar(
    item: PendenciaItem,
    salvando: Boolean,
    onConfirmar: (Double, Int?, Boolean) -> Unit
) {
    var preco by remember {
        mutableStateOf(
            item.produtoPrecoRef?.let { "%.2f".format(it).replace('.', ',') } ?: ""
        )
    }
    var controlaEstoque by remember { mutableStateOf(true) }
    var qtd by remember { mutableStateOf("0") }
    var erroLocal by remember { mutableStateOf<String?>(null) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Text(item.produtoEmoji ?: "📦", fontSize = 32.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.produtoNome.orEmpty(),
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            item.produtoCategoria?.let {
                Spacer(Modifier.height(2.dp))
                Text(
                    it.uppercase(),
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.5.sp
                )
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    CampoTexto(
        label = "Preço de venda (R$)",
        valor = preco,
        onValor = { preco = it.filter { ch -> ch.isDigit() || ch == ',' || ch == '.' } },
        keyboard = KeyboardType.Decimal
    )
    Spacer(Modifier.height(10.dp))
    SwitchLinha(
        texto = "Controlar estoque nesta unidade",
        valor = controlaEstoque,
        onValor = { controlaEstoque = it }
    )
    if (controlaEstoque) {
        Spacer(Modifier.height(10.dp))
        CampoTexto(
            label = "Quantidade inicial",
            valor = qtd,
            onValor = { qtd = it.filter(Char::isDigit) },
            keyboard = KeyboardType.Number
        )
    }

    erroLocal?.let {
        Spacer(Modifier.height(8.dp))
        Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
    }

    Spacer(Modifier.height(18.dp))
    BotaoPrimario(
        texto = if (salvando) "Salvando…" else "Adicionar ao planograma",
        salvando = salvando,
        onClick = {
            val p = parsePreco(preco)
            val q = if (controlaEstoque) qtd.toIntOrNull() else null
            when {
                p == null || p <= 0.0 -> erroLocal = "Informe um preço válido"
                controlaEstoque && (q == null) -> erroLocal = "Informe a quantidade"
                else -> { erroLocal = null; onConfirmar(p, q, controlaEstoque) }
            }
        }
    )
}

@Composable
private fun FormularioCadastrar(
    codigoBarras: String,
    categorias: List<CategoriaSimples>,
    salvando: Boolean,
    onConfirmar: (String, Double, String?, String?, Uri?, Boolean, Int?, Boolean) -> Unit
) {
    var nome by remember { mutableStateOf("") }
    var preco by remember { mutableStateOf("") }
    var categoriaSel by remember { mutableStateOf<String?>(null) }
    var emoji by remember { mutableStateOf("") }
    var foto by remember { mutableStateOf<Uri?>(null) }
    var restritoIdade by remember { mutableStateOf(false) }
    var controlaEstoque by remember { mutableStateOf(true) }
    var qtd by remember { mutableStateOf("0") }
    var erroLocal by remember { mutableStateOf<String?>(null) }

    val pickImage = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri -> if (uri != null) foto = uri }

    FotoPicker(
        fotoUri = foto,
        emoji = emoji,
        onEscolherFoto = {
            pickImage.launch(
                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
            )
        },
        onRemoverFoto = { foto = null }
    )

    Spacer(Modifier.height(14.dp))
    CampoTexto(
        label = "Nome do produto",
        valor = nome,
        onValor = { nome = it }
    )
    Spacer(Modifier.height(10.dp))
    CampoTexto(
        label = "Preço de venda (R$)",
        valor = preco,
        onValor = { preco = it.filter { ch -> ch.isDigit() || ch == ',' || ch == '.' } },
        keyboard = KeyboardType.Decimal
    )
    Spacer(Modifier.height(10.dp))
    Row {
        Box(Modifier.weight(1f)) {
            CampoTexto(
                label = "Emoji (opcional)",
                valor = emoji,
                onValor = { emoji = it.take(4) }
            )
        }
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f)) {
            SwitchLinha(
                texto = "Restrito +18",
                valor = restritoIdade,
                onValor = { restritoIdade = it }
            )
        }
    }
    Spacer(Modifier.height(10.dp))
    CategoriasChips(
        categorias = categorias,
        selecionada = categoriaSel,
        onSelecionar = { categoriaSel = it }
    )

    Spacer(Modifier.height(10.dp))
    SwitchLinha(
        texto = "Controlar estoque",
        valor = controlaEstoque,
        onValor = { controlaEstoque = it }
    )
    if (controlaEstoque) {
        Spacer(Modifier.height(10.dp))
        CampoTexto(
            label = "Quantidade inicial",
            valor = qtd,
            onValor = { qtd = it.filter(Char::isDigit) },
            keyboard = KeyboardType.Number
        )
    }

    erroLocal?.let {
        Spacer(Modifier.height(8.dp))
        Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
    }

    Spacer(Modifier.height(18.dp))
    BotaoPrimario(
        texto = if (salvando) "Salvando…" else "Cadastrar produto",
        salvando = salvando,
        onClick = {
            val p = parsePreco(preco)
            val q = if (controlaEstoque) qtd.toIntOrNull() else null
            when {
                nome.isBlank() -> erroLocal = "Informe o nome"
                p == null || p <= 0.0 -> erroLocal = "Informe um preço válido"
                controlaEstoque && q == null -> erroLocal = "Informe a quantidade"
                else -> {
                    erroLocal = null
                    onConfirmar(
                        nome.trim(),
                        p,
                        categoriaSel,
                        emoji.trim().ifEmpty { null },
                        foto,
                        restritoIdade,
                        q,
                        controlaEstoque
                    )
                }
            }
        }
    )
}

@Composable
private fun FotoPicker(
    fotoUri: Uri?,
    emoji: String,
    onEscolherFoto: () -> Unit,
    onRemoverFoto: () -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(80.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(18.dp))
                .clickable(onClick = onEscolherFoto),
            contentAlignment = Alignment.Center
        ) {
            if (fotoUri != null) {
                // Preview simples — AsyncImage exigiria Coil. Mostramos indicador de foto escolhida.
                Icon(
                    Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(36.dp)
                )
            } else if (emoji.isNotBlank()) {
                Text(emoji, fontSize = 38.sp)
            } else {
                Icon(
                    Icons.Filled.AddPhotoAlternate,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(28.dp)
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                if (fotoUri != null) "Foto selecionada" else "Foto do produto",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(2.dp))
            Text(
                if (fotoUri != null) "Toque no botão para trocar" else "Opcional — usa emoji se vazio",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp
            )
            Spacer(Modifier.height(8.dp))
            Row {
                SmallAction(if (fotoUri != null) "Trocar" else "Escolher", onEscolherFoto)
                if (fotoUri != null) {
                    Spacer(Modifier.width(8.dp))
                    SmallAction("Remover", onRemoverFoto, erro = true)
                }
            }
        }
    }
}

@Composable
private fun SmallAction(texto: String, onClick: () -> Unit, erro: Boolean = false) {
    Box(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            texto,
            color = if (erro) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun CategoriasChips(
    categorias: List<CategoriaSimples>,
    selecionada: String?,
    onSelecionar: (String?) -> Unit
) {
    Column {
        Text(
            "CATEGORIA",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 2.sp
        )
        Spacer(Modifier.height(8.dp))
        androidx.compose.foundation.layout.FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            categorias.forEach { cat ->
                val sel = cat.nome == selecionada
                val bg = if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
                val fg = if (sel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(bg)
                        .border(1.dp, if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, RoundedCornerShape(999.dp))
                        .clickable { onSelecionar(if (sel) null else cat.nome) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        listOfNotNull(cat.emoji, cat.nome).joinToString(" "),
                        color = fg,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.3.sp
                    )
                }
            }
            if (categorias.isEmpty()) {
                Text(
                    "Nenhuma categoria cadastrada",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp
                )
            }
        }
    }
}

@Composable
private fun CampoTexto(
    label: String,
    valor: String,
    onValor: (String) -> Unit,
    keyboard: KeyboardType = KeyboardType.Text
) {
    Column {
        Text(
            label.uppercase(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 2.sp
        )
        Spacer(Modifier.height(4.dp))
        OutlinedTextField(
            value = valor,
            onValueChange = onValor,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(54.dp),
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
private fun SwitchLinha(texto: String, valor: Boolean, onValor: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp))
            .clickable { onValor(!valor) }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            texto,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f)
        )
        androidx.compose.material3.Switch(
            checked = valor,
            onCheckedChange = onValor
        )
    }
}

@Composable
private fun BotaoPrimario(texto: String, salvando: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.primary)
            .clickable(enabled = !salvando, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        if (salvando) {
            CircularProgressIndicator(
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.5.dp,
                modifier = Modifier.size(22.dp)
            )
        } else {
            Text(
                texto,
                color = MaterialTheme.colorScheme.onPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.3.sp
            )
        }
    }
}

private fun parsePreco(s: String): Double? =
    s.trim().replace(',', '.').toDoubleOrNull()
