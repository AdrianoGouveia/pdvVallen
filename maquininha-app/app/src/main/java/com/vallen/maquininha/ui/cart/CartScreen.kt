package com.vallen.maquininha.ui.cart

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vallen.maquininha.data.CartStore
import com.vallen.maquininha.data.ItemCarrinho
import com.vallen.maquininha.ui.components.StatusBar
import com.vallen.maquininha.ui.components.VallenLogo

@Composable
fun CartScreen(
    onVoltar: () -> Unit,
    onPagar: () -> Unit,
    onCancelar: (() -> Unit)? = null,
    onLogoClick: (() -> Unit)? = null
) {
    val items by CartStore.items.collectAsStateWithLifecycle()
    val total = items.sumOf { it.subtotal }
    val qtdTotal = items.sumOf { it.quantidade }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        StatusBar()
        CartHeader(
            qtdTotal = qtdTotal,
            onLogoClick = onLogoClick,
            onCancelar = onCancelar
        )

        if (items.isEmpty()) {
            Box(Modifier.fillMaxSize().weight(1f), contentAlignment = Alignment.Center) {
                Text("Carrinho vazio", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(items, key = { it.produto.id }) { item ->
                    ItemCard(
                        item = item,
                        onInc = { CartStore.setQuantidade(item.produto.id, item.quantidade + 1) },
                        onDec = { CartStore.setQuantidade(item.produto.id, item.quantidade - 1) }
                    )
                }
            }
        }

        Footer(
            total = total,
            onEscolherLista = onVoltar,
            onFinalizar = onPagar,
            habilitado = items.isNotEmpty()
        )
    }
}

@Composable
private fun CartHeader(
    qtdTotal: Int,
    onLogoClick: (() -> Unit)?,
    onCancelar: (() -> Unit)?
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
            VallenLogo(fontSize = 18, onClick = onLogoClick)
            Spacer(Modifier.width(12.dp))
            Text(
                "Meu carrinho",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
            if (qtdTotal > 0) {
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier
                        .height(28.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(MaterialTheme.colorScheme.primary)
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "$qtdTotal",
                        color = MaterialTheme.colorScheme.onPrimary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }
        if (onCancelar != null) {
            Box(
                Modifier
                    .height(44.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable(onClick = onCancelar)
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "CANCELAR",
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
            }
        }
    }
}

@Composable
private fun ItemCard(item: ItemCarrinho, onInc: () -> Unit, onDec: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(20.dp))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(
                    item.produto.nome,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.size(6.dp))
                Text(
                    formatarReal(item.subtotal),
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Spacer(Modifier.size(2.dp))
                Text(
                    "${formatarReal(item.produto.preco)} · preço unitário",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp
                )
            }
            Spacer(Modifier.width(12.dp))
            Box(
                Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(item.produto.emoji ?: "📦", fontSize = 30.sp)
            }
        }

        Spacer(Modifier.size(12.dp))

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            StepperBtn(
                icon = Icons.Filled.Remove,
                background = MaterialTheme.colorScheme.surfaceVariant,
                iconColor = MaterialTheme.colorScheme.onSurface,
                hasBorder = true,
                onClick = onDec
            )
            Spacer(Modifier.width(12.dp))
            Text(
                "${item.quantidade}",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.width(36.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            Spacer(Modifier.width(12.dp))
            StepperBtn(
                icon = Icons.Filled.Add,
                background = MaterialTheme.colorScheme.primary,
                iconColor = MaterialTheme.colorScheme.onPrimary,
                hasBorder = false,
                onClick = onInc
            )
        }
    }
}

@Composable
private fun StepperBtn(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    background: androidx.compose.ui.graphics.Color,
    iconColor: androidx.compose.ui.graphics.Color,
    hasBorder: Boolean,
    onClick: () -> Unit
) {
    val shape = CircleShape
    val base = Modifier
        .size(44.dp)
        .clip(shape)
        .background(background)
    val withBorder = if (hasBorder) base.border(1.dp, MaterialTheme.colorScheme.outline, shape) else base
    Box(
        withBorder.clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, tint = iconColor)
    }
}

@Composable
private fun Footer(
    total: Double,
    onEscolherLista: () -> Unit,
    onFinalizar: () -> Unit,
    habilitado: Boolean
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FooterBtn(
            modifier = Modifier.weight(1f),
            background = MaterialTheme.colorScheme.surfaceVariant,
            border = true,
            onClick = onEscolherLista
        ) {
            Icon(Icons.Filled.ShoppingCart, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.size(6.dp))
            Text(
                "ESCOLHER\nDA LISTA",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                lineHeight = 14.sp
            )
        }

        FooterBtn(
            modifier = Modifier.weight(1f),
            background = if (habilitado) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
            border = false,
            onClick = { if (habilitado) onFinalizar() }
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
                Spacer(Modifier.size(6.dp))
                Text(
                    "FINALIZAR",
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.sp
                )
            }
            Spacer(Modifier.size(2.dp))
            Text(
                "TOTAL ${formatarReal(total)}",
                color = MaterialTheme.colorScheme.onPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun FooterBtn(
    modifier: Modifier = Modifier,
    background: androidx.compose.ui.graphics.Color,
    border: Boolean,
    onClick: () -> Unit,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit
) {
    val base = modifier
        .height(82.dp)
        .clip(RoundedCornerShape(20.dp))
        .background(background)
    val withBorder = if (border) base.border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(20.dp)) else base
    Column(
        withBorder.clickable(onClick = onClick).padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        content = content
    )
}

private fun formatarReal(v: Double): String =
    "R$ ${"%.2f".format(v).replace('.', ',')}"
