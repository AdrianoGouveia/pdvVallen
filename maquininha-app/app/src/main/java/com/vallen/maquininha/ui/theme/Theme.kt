package com.vallen.maquininha.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val VallenColorScheme = darkColorScheme(
    primary = VallenPink,
    onPrimary = VallenBlack,
    primaryContainer = VallenPinkDark,
    onPrimaryContainer = VallenBlack,
    secondary = VallenPinkLight,
    onSecondary = VallenBlack,
    background = VallenBlack,
    onBackground = VallenText,
    surface = VallenCard,
    onSurface = VallenText,
    surfaceVariant = VallenSurface,
    onSurfaceVariant = VallenTextMuted,
    outline = VallenBorder,
    error = VallenError,
    onError = VallenText,
    tertiary = VallenSuccess,
    onTertiary = VallenBlack
)

@Composable
fun VallenMaquininhaTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = VallenBlack.toArgb()
            window.navigationBarColor = VallenBlack.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = VallenColorScheme,
        typography = Typography,
        shapes = VallenShapes,
        content = content
    )
}
