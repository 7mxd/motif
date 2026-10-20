package com.example.shop

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun Cart(modifier: Modifier = Modifier) {
    val spec = tween<Float>(250, easing = FastOutSlowInEasing)
    val shape = RoundedCornerShape(12.dp)
    Box(modifier.padding(13.dp))
}
