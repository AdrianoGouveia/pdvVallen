package com.vallen.maquininha.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun VallenLogo(modifier: Modifier = Modifier, fontSize: Int = 28) {
    Row(modifier = modifier, verticalAlignment = Alignment.Bottom) {
        Text(
            text = "vallen",
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = fontSize.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = (-1.2).sp
        )
        Box(
            Modifier
                .size((fontSize * 0.18).dp.coerceAtLeast(4.dp))
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary)
        )
    }
}
