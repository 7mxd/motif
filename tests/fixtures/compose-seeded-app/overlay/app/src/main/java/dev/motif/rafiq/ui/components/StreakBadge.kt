package dev.motif.rafiq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import dev.motif.rafiq.R
import dev.motif.rafiq.ui.motif.MotifRadius
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

/** How many days in a row: a sand badge with a star, or plain words before a streak starts. */
@Composable
fun StreakBadge(days: Int, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    if (days == 0) {
        Text(stringResource(R.string.streak_none), style = MotifType.label, color = colors.textSecondary, modifier = modifier)
        return
    }
    Row(
        modifier = modifier
            .background(colors.actionSecondary, RoundedCornerShape(MotifRadius.full))
            .padding(horizontal = MotifSpace.s2, vertical = MotifSpace.s1),
        horizontalArrangement = Arrangement.spacedBy(MotifSpace.s1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Star, contentDescription = null, tint = colors.onActionSecondary, modifier = Modifier.size(16.dp))
        Text(pluralStringResource(R.plurals.streak, days, days), style = MotifType.label, color = Color(0xFF8A4B00))
    }
}
