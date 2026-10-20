package com.example.shop.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.shop.R

val Inter = FontFamily(Font(R.font.inter_regular), Font(R.font.inter_bold, FontWeight.Bold))

val Typography = Typography(
    titleLarge = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    bodyLarge = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp)
)
