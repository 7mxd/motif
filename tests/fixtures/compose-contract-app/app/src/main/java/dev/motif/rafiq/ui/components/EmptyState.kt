package dev.motif.rafiq.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

/** Nothing here yet: an icon, a line of why, and one action. */
@Composable
fun EmptyState(title: String, body: String, action: String, onAction: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    Column(
        modifier = modifier.fillMaxWidth().padding(MotifSpace.s8),
        verticalArrangement = Arrangement.spacedBy(MotifSpace.s3),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = colors.actionPrimary, modifier = Modifier.size(48.dp))
        Text(title, style = MotifType.heading, color = colors.textPrimary, modifier = Modifier.semantics { heading() })
        Text(body, style = MotifType.body, color = colors.textSecondary, textAlign = TextAlign.Center)
        AppButton(label = action, onClick = onAction)
    }
}
