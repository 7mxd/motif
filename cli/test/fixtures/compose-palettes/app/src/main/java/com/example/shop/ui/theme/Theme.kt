package com.example.shop.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = Purple80,
    secondary = PurpleGrey80,
    tertiary = Pink80
)

private val LightColorScheme = lightColorScheme(
    primary = Purple40,
    secondary = PurpleGrey40,
    tertiary = Pink40
)

private val PartnerLightColors = lightColorScheme(
    primary = Color(0xFF0F766E),
    onPrimary = Color.White,
    background = Color(0xFFF0FDFA)
)

private val PartnerDarkColors = darkColorScheme(
    primary = Color(0xFF5EEAD4),
    onPrimary = Color.Black,
    background = Color(0xFF042F2E)
)

@Composable
fun ShopTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme, content = content)
}
