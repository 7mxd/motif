package dev.motif.rafiq.ui.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.motif.rafiq.R
import dev.motif.rafiq.data.Habit
import dev.motif.rafiq.data.HabitRepository
import dev.motif.rafiq.ui.components.HabitRow
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

@Composable
fun TodayScreen(
    highContrast: Boolean,
    onHighContrastChange: (Boolean) -> Unit,
    onOpenHabit: (String) -> Unit,
    onAddHabit: () -> Unit,
    onSignOut: () -> Unit,
    viewModel: TodayViewModel = viewModel(),
) {
    val habits by viewModel.habits.collectAsStateWithLifecycle()
    TodayContent(
        habits = habits,
        highContrast = highContrast,
        onHighContrastChange = onHighContrastChange,
        onOpenHabit = onOpenHabit,
        onToggle = viewModel::toggle,
        onAddHabit = onAddHabit,
        onSignOut = onSignOut,
    )
}

@OptIn(ExperimentalMaterial3Api::class) // TopAppBar is still marked experimental in Material 3 1.3.
@Composable
fun TodayContent(
    habits: List<Habit>,
    highContrast: Boolean,
    onHighContrastChange: (Boolean) -> Unit,
    onOpenHabit: (String) -> Unit,
    onToggle: (String) -> Unit,
    onAddHabit: () -> Unit,
    onSignOut: () -> Unit,
) {
    val colors = MotifTheme.colors
    Scaffold(
        containerColor = colors.background,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name), style = MotifType.heading) },
                actions = {
                    IconButton(onClick = onAddHabit, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.today_add))
                    }
                    IconButton(onClick = onSignOut) {
                        Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.background,
                    titleContentColor = colors.textPrimary,
                    actionIconContentColor = colors.textPrimary,
                ),
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(horizontal = MotifSpace.s4, vertical = MotifSpace.s2),
            verticalArrangement = Arrangement.spacedBy(MotifSpace.s3),
        ) {
            item {
                Column(Modifier.padding(bottom = MotifSpace.s3), verticalArrangement = Arrangement.spacedBy(MotifSpace.s1)) {
                    Text(
                        stringResource(R.string.today_title),
                        style = MotifType.title,
                        color = colors.textPrimary,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        stringResource(R.string.today_summary, habits.count { it.doneToday }, habits.size),
                        style = MotifType.body,
                        color = colors.textSecondary,
                    )
                }
            }
            items(habits, key = { it.id }) { habit ->
                HabitRow(habit = habit, onOpen = { onOpenHabit(habit.id) }, onToggle = { onToggle(habit.id) })
            }
            item {
                ContrastSwitch(highContrast, onHighContrastChange, Modifier.padding(top = MotifSpace.s6))
            }
        }
    }
}

/** The High contrast variant, on or off: the whole row is the switch. */
@Composable
private fun ContrastSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .toggleable(value = checked, onValueChange = onCheckedChange, role = Role.Switch)
            .padding(vertical = MotifSpace.s2),
        horizontalArrangement = Arrangement.spacedBy(MotifSpace.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.today_contrast), style = MotifType.body, color = colors.textPrimary)
            Text(stringResource(R.string.today_contrast_help), style = MotifType.caption, color = colors.textSecondary)
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Preview
@Composable
fun TodayPreview() {
    MotifTheme {
        TodayContent(
            habits = HabitRepository.habits.value,
            highContrast = false,
            onHighContrastChange = {},
            onOpenHabit = {},
            onToggle = {},
            onAddHabit = {},
            onSignOut = {},
        )
    }
}

@Preview
@Composable
fun TodayEmptyPreview() {
    MotifTheme {
        TodayContent(
            habits = emptyList(),
            highContrast = false,
            onHighContrastChange = {},
            onOpenHabit = {},
            onToggle = {},
            onAddHabit = {},
            onSignOut = {},
        )
    }
}
