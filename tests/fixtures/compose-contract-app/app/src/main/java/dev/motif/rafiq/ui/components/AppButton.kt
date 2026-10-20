package dev.motif.rafiq.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import dev.motif.rafiq.ui.motif.MotifMotion
import dev.motif.rafiq.ui.motif.MotifRadius
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

enum class ButtonKind { Primary, Secondary }

/** Rafiq's button: primary for the one main action on a screen, secondary for the others. */
@Composable
fun AppButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.Primary,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val colors = MotifTheme.colors
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    // With Remove animations on, a spinner freezes on one frame and reads as stuck, so the button shows its label.
    val spinner = loading && !MotifMotion.reduced()
    val container = if (kind == ButtonKind.Primary) colors.actionPrimary else colors.actionSecondary
    val content = if (kind == ButtonKind.Primary) colors.onActionPrimary else colors.onActionSecondary
    Button(
        onClick = onClick,
        // Loading ignores taps but keeps the button's colours, size and name.
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(MotifRadius.md),
        colors = ButtonDefaults.buttonColors(
            containerColor = container,
            contentColor = content,
            disabledContainerColor = if (loading) container else colors.actionSecondary,
            disabledContentColor = if (loading) content else colors.onActionSecondary,
        ),
        border = if (focused) BorderStroke(2.dp, colors.focus) else null,
        contentPadding = PaddingValues(horizontal = MotifSpace.s6),
        interactionSource = interactionSource,
    ) {
        // The label stays in the layout (and is read aloud) while the spinner shows,
        // so the button keeps its size and its name.
        Box(contentAlignment = Alignment.Center) {
            Text(label, style = MotifType.label, modifier = Modifier.alpha(if (spinner) 0f else 1f))
            if (spinner) {
                CircularProgressIndicator(
                    modifier = Modifier.size(MotifSpace.s5),
                    color = content,
                    strokeWidth = 2.dp,
                )
            }
        }
    }
}
