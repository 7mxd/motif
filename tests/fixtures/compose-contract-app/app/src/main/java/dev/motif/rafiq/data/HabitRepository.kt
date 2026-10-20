package dev.motif.rafiq.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** How often a habit is meant to happen. */
enum class Goal { Daily, Weekdays }

/**
 * A habit and what happened to it: [history] holds the last 14 days, today first (true when it was done that day).
 */
data class Habit(
    val id: String,
    val name: String,
    val goal: Goal,
    val history: List<Boolean>,
    val best: Int,
) {
    val doneToday: Boolean get() = history.firstOrNull() == true

    /** Days in a row up to today; a day not yet ticked doesn't break it. */
    val streak: Int
        get() = history.drop(if (doneToday) 0 else 1).takeWhile { it }.size

    val bestStreak: Int get() = maxOf(best, streak)
}

/** The habits, kept in memory on the phone (there is no server). */
object HabitRepository {
    const val DAYS = 14

    private fun days(vararg done: Int) = List(DAYS) { it in done }

    private val seed = listOf(
        Habit("walk", "Morning walk", Goal.Daily, days(1, 2, 3, 4, 5, 8, 9, 10), best = 9),
        Habit("read", "Read 10 pages", Goal.Daily, days(0, 1, 2, 6, 7, 11), best = 12),
        Habit("water", "شرب ٨ أكواب ماء", Goal.Daily, days(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10), best = 11),
        Habit("stretch", "Stretch for 5 minutes", Goal.Weekdays, days(3, 4), best = 4),
    )

    private val state = MutableStateFlow(seed)
    val habits: StateFlow<List<Habit>> = state.asStateFlow()

    fun find(id: String): Habit? = state.value.find { it.id == id }

    fun toggleToday(id: String) {
        state.update { list ->
            list.map { habit ->
                if (habit.id != id) habit else habit.copy(history = listOf(!habit.doneToday) + habit.history.drop(1))
            }
        }
    }

    fun add(name: String, goal: Goal): Habit {
        val base = name.lowercase().replace(Regex("""[^\p{L}\p{N}]+"""), "-").trim('-').ifEmpty { "habit" }
        var id = base
        var n = 2
        while (find(id) != null) id = "$base-${n++}"
        val habit = Habit(id, name.trim(), goal, List(DAYS) { false }, best = 0)
        state.update { it + habit }
        return habit
    }

    /** Back to the habits the app starts with (Motif's screenshots call it before each one). */
    fun reset() {
        state.value = seed
    }
}
