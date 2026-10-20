package dev.motif.rafiq.ui.habit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.motif.rafiq.data.Habit
import dev.motif.rafiq.data.HabitRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** One habit, by its id, and marking today done or not. */
class HabitViewModel(private val id: String, private val repository: HabitRepository = HabitRepository) : ViewModel() {
    val habit: StateFlow<Habit?> = repository.habits
        .map { list -> list.find { it.id == id } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, repository.find(id))

    fun toggleToday() {
        repository.toggleToday(id)
    }
}
