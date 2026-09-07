package com.donnicolas.rfid.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val ColorScheme = darkColorScheme(
    primary = Color(0xFF3B82F6),
    onPrimary = Color.White,
    background = Color(0xFF0F1419),
    surface = Color(0xFF1A2332),
    onBackground = Color(0xFFE8EDF5),
    onSurface = Color(0xFFE8EDF5),
    error = Color(0xFFF87171),
)

@Composable
fun DonNicolasTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ColorScheme,
        content = content,
    )
}
