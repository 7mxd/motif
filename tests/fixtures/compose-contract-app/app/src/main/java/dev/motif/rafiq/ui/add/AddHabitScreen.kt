package dev.motif.rafiq.ui.add

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.motif.rafiq.R
import dev.motif.rafiq.data.Goal
import dev.motif.rafiq.ui.components.AppButton
import dev.motif.rafiq.ui.components.AppField
import dev.motif.rafiq.ui.components.BackTopBar
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

@Composable
fun AddHabitScreen(onBack: () -> Unit, onSaved: () -> Unit, viewModel: AddHabitViewModel = viewModel()) {
    val form by viewModel.form.collectAsStateWithLifecycle()
    AddHabitContent(
        form = form,
        onNameChange = viewModel::setName,
        onGoalChange = viewModel::setGoal,
        onSave = { if (viewModel.save()) onSaved() },
        onBack = onBack,
    )
}

@Composable
fun AddHabitContent(
    form: AddHabitState,
    onNameChange: (String) -> Unit,
    onGoalChange: (Goal) -> Unit,
    onSave: () -> Unit,
    onBack: () -> Unit,
) {
    val colors = MotifTheme.colors
    Scaffold(
        containerColor = colors.background,
        topBar = { BackTopBar(title = stringResource(R.string.add_title), onBack = onBack) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MotifSpace.s4, vertical = MotifSpace.s2),
            verticalArrangement = Arrangement.spacedBy(MotifSpace.s6),
        ) {
            AppField(
                value = form.name,
                onValueChange = onNameChange,
                label = stringResource(R.string.add_name),
                helper = stringResource(R.string.add_name_helper),
                error = form.nameError?.let { stringResource(it) },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            )
            Column(Modifier.selectableGroup()) {
                Text(
                    stringResource(R.string.add_goal),
                    style = MotifType.heading,
                    color = colors.textPrimary,
                    modifier = Modifier.semantics { heading() },
                )
                GoalOption(stringResource(R.string.habit_goal_daily), selected = form.goal == Goal.Daily, onSelect = { onGoalChange(Goal.Daily) })
                GoalOption(stringResource(R.string.habit_goal_weekdays), selected = form.goal == Goal.Weekdays, onSelect = { onGoalChange(Goal.Weekdays) })
            }
            AppButton(label = stringResource(R.string.add_save), onClick = onSave, modifier = Modifier.fillMaxWidth())
        }
    }
}

/** One choice of how often: the whole row is the radio button. */
@Composable
private fun GoalOption(label: String, selected: Boolean, onSelect: () -> Unit) {
    val colors = MotifTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected = selected, onClick = onSelect, role = Role.RadioButton),
        horizontalArrangement = Arrangement.spacedBy(MotifSpace.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(
            selected = selected,
            onClick = null,
            colors = RadioButtonDefaults.colors(selectedColor = colors.actionPrimary, unselectedColor = colors.textSecondary),
        )
        Text(label, style = MotifType.body, color = colors.textPrimary)
    }
}

@Preview
@Composable
fun AddHabitPreview() {
    MotifTheme {
        AddHabitContent(form = AddHabitState(), onNameChange = {}, onGoalChange = {}, onSave = {}, onBack = {})
    }
}
