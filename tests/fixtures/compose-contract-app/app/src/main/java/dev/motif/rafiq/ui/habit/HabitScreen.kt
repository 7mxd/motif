package dev.motif.rafiq.ui.habit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.motif.rafiq.R
import dev.motif.rafiq.data.Goal
import dev.motif.rafiq.data.Habit
import dev.motif.rafiq.data.HabitRepository
import dev.motif.rafiq.ui.components.AppButton
import dev.motif.rafiq.ui.components.BackTopBar
import dev.motif.rafiq.ui.components.ButtonKind
import dev.motif.rafiq.ui.motif.MotifRadius
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

@Composable
fun HabitScreen(id: String, onBack: () -> Unit, viewModel: HabitViewModel = viewModel(key = id) { HabitViewModel(id) }) {
    val habit by viewModel.habit.collectAsStateWithLifecycle()
    HabitContent(habit = habit, onBack = onBack, onToggleToday = viewModel::toggleToday)
}

@Composable
fun HabitContent(habit: Habit?, onBack: () -> Unit, onToggleToday: () -> Unit) {
    val colors = MotifTheme.colors
    Scaffold(
        containerColor = colors.background,
        topBar = { BackTopBar(title = habit?.name.orEmpty(), onBack = onBack) },
    ) { innerPadding ->
        if (habit == null) {
            Box(Modifier.fillMaxSize().padding(innerPadding).padding(MotifSpace.s6), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.habit_missing), style = MotifType.body, color = colors.textSecondary)
            }
            return@Scaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MotifSpace.s4, vertical = MotifSpace.s2),
            verticalArrangement = Arrangement.spacedBy(MotifSpace.s8),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(MotifSpace.s4), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.count, habit.streak), style = MotifType.display, color = colors.textPrimary)
                Column(verticalArrangement = Arrangement.spacedBy(MotifSpace.s1)) {
                    Text(pluralStringResource(R.plurals.habit_in_a_row, habit.streak), style = MotifType.heading, color = colors.textPrimary)
                    Text(pluralStringResource(R.plurals.habit_best, habit.bestStreak, habit.bestStreak), style = MotifType.body, color = colors.textSecondary)
                    Text(
                        stringResource(if (habit.goal == Goal.Daily) R.string.habit_goal_daily else R.string.habit_goal_weekdays),
                        style = MotifType.body,
                        color = colors.textSecondary,
                    )
                }
            }
            History(habit)
            AppButton(
                label = stringResource(if (habit.doneToday) R.string.habit_undo else R.string.habit_mark_done),
                onClick = onToggleToday,
                kind = if (habit.doneToday) ButtonKind.Secondary else ButtonKind.Primary,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** The last 14 days, oldest at the start and today at the end; the sentence under the squares says it aloud. */
@Composable
private fun History(habit: Habit) {
    val colors = MotifTheme.colors
    val summary = stringResource(R.string.habit_history_summary, habit.history.count { it })
    Column(verticalArrangement = Arrangement.spacedBy(MotifSpace.s3)) {
        Text(
            stringResource(R.string.habit_history),
            style = MotifType.heading,
            color = colors.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Row(
            modifier = Modifier.fillMaxWidth().clearAndSetSemantics { },
            horizontalArrangement = Arrangement.spacedBy(MotifSpace.s1),
        ) {
            val shape = RoundedCornerShape(MotifRadius.sm)
            for (done in habit.history.reversed()) {
                Box(
                    Modifier
                        .weight(1f)
                        .aspectRatio(1f)
                        .background(if (done) colors.actionPrimary else colors.surface, shape)
                        .border(1.dp, if (done) colors.actionPrimary else colors.border, shape),
                )
            }
        }
        Text(summary, style = MotifType.body, color = colors.textSecondary)
    }
}

@Preview
@Composable
fun HabitPreview() {
    MotifTheme {
        HabitContent(habit = HabitRepository.habits.value.first(), onBack = {}, onToggleToday = {})
    }
}
