package dev.motif.rafiq.ui.add

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import dev.motif.rafiq.R
import dev.motif.rafiq.data.Goal
import dev.motif.rafiq.data.HabitRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class AddHabitState(
    val name: String = "",
    val goal: Goal = Goal.Daily,
    @param:StringRes val nameError: Int? = null,
)

/** The new habit's form: checked when it's saved. */
class AddHabitViewModel(private val repository: HabitRepository = HabitRepository) : ViewModel() {
    private val state = MutableStateFlow(AddHabitState())
    val form: StateFlow<AddHabitState> = state.asStateFlow()

    fun setName(name: String) {
        state.update { it.copy(name = name, nameError = null) }
    }

    fun setGoal(goal: Goal) {
        state.update { it.copy(goal = goal) }
    }

    /** True when the habit was saved; otherwise the form says what's missing. */
    fun save(): Boolean {
        val form = state.value
        if (form.name.isBlank()) {
            state.update { it.copy(nameError = R.string.add_name_error) }
            return false
        }
        repository.add(form.name, form.goal)
        return true
    }
}
