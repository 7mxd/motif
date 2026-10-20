package dev.motif.rafiq.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.motif.rafiq.R
import dev.motif.rafiq.data.Habit
import dev.motif.rafiq.ui.motif.MotifDurations
import dev.motif.rafiq.ui.motif.MotifEasing
import dev.motif.rafiq.ui.motif.MotifMotion
import dev.motif.rafiq.ui.motif.MotifRadius
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

/** A habit in today's list: tap the row to open it, tick the box when it's done today. */
@Composable
fun HabitRow(habit: Habit, onOpen: () -> Unit, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val border by animateColorAsState(
        targetValue = when {
            focused -> colors.focus
            habit.doneToday -> colors.actionPrimary
            else -> colors.border
        },
        animationSpec = tween(MotifMotion.duration(MotifDurations.fast), easing = MotifEasing.standard),
        label = "border",
    )
    val markDone = stringResource(R.string.today_mark_done, habit.name)
    Surface(
        onClick = onOpen,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(MotifRadius.lg),
        color = colors.surface,
        contentColor = colors.textPrimary,
        border = BorderStroke(if (focused) 2.dp else 1.dp, border),
        interactionSource = interactionSource,
    ) {
        Row(
            modifier = Modifier.padding(start = MotifSpace.s4, end = MotifSpace.s2, top = MotifSpace.s3, bottom = MotifSpace.s3),
            horizontalArrangement = Arrangement.spacedBy(MotifSpace.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MotifSpace.s2)) {
                Text(habit.name, style = MotifType.body, color = colors.textPrimary)
                StreakBadge(habit.streak)
            }
            Checkbox(
                checked = habit.doneToday,
                onCheckedChange = { onToggle() },
                modifier = Modifier.semantics { contentDescription = markDone },
                colors = CheckboxDefaults.colors(
                    checkedColor = colors.actionPrimary,
                    checkmarkColor = colors.onActionPrimary,
                    uncheckedColor = colors.textSecondary,
                ),
            )
        }
    }
}
