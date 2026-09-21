package com.donnicolas.rfid.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Light WMS — slate + steel blue (aligned with web). */
val WmsBg = Color(0xFFE8EDF4)
val WmsSurface = Color(0xFFFFFFFF)
val WmsText = Color(0xFF132033)
val WmsMuted = Color(0xFF5B6B7E)
val WmsFaint = Color(0xFF8191A3)
val WmsPrimary = Color(0xFF1D4ED8)
val WmsPrimaryDark = Color(0xFF1E40AF)
val WmsOk = Color(0xFF15803D)
val WmsWarn = Color(0xFFB45309)
val WmsDanger = Color(0xFFB91C1C)
/** Exceso de unidades leídas vs esperadas (celeste). */
val WmsExcess = Color(0xFF0EA5E9)
val WmsBorder = Color(0xFFD0D8E4)
val WmsInput = Color(0xFFF4F7FB)

/** Soft banner / chip fills (semantic helpers). */
val WmsOkSoft = Color(0xFFDCFCE7)
val WmsWarnSoft = Color(0xFFFEF3C7)
val WmsInfoSoft = Color(0xFFDBE4FF)
val WmsDangerSoft = Color(0xFFFEE2E2)

private val LightColors = lightColorScheme(
    primary = WmsPrimary,
    onPrimary = Color.White,
    primaryContainer = WmsInfoSoft,
    onPrimaryContainer = Color(0xFF1E3A8A),
    secondary = WmsMuted,
    onSecondary = Color.White,
    tertiary = WmsWarn,
    onTertiary = Color.White,
    background = WmsBg,
    onBackground = WmsText,
    surface = WmsSurface,
    onSurface = WmsText,
    surfaceVariant = WmsInput,
    onSurfaceVariant = WmsMuted,
    outline = WmsBorder,
    outlineVariant = Color(0xFFAEB9C9),
    error = WmsDanger,
    onError = Color.White,
    errorContainer = WmsDangerSoft,
    onErrorContainer = WmsDanger,
)

/** Compact type scale for ~4" handheld. */
private val CompactTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.2).sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 22.sp,
        letterSpacing = (-0.15).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 20.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 16.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 17.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 15.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 16.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 10.sp,
        lineHeight = 12.sp,
        letterSpacing = 0.2.sp,
    ),
)

@Composable
fun DonNicolasTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = CompactTypography,
        content = content,
    )
}
