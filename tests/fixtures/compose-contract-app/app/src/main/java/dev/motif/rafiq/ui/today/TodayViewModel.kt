package dev.motif.rafiq.ui.today

import androidx.lifecycle.ViewModel
import dev.motif.rafiq.data.Habit
import dev.motif.rafiq.data.HabitRepository
import kotlinx.coroutines.flow.StateFlow

/** Today's habits, and ticking one off. */
class TodayViewModel(private val repository: HabitRepository = HabitRepository) : ViewModel() {
    val habits: StateFlow<List<Habit>> = repository.habits

    fun toggle(id: String) {
        repository.toggleToday(id)
    }
}
