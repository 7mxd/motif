// Motif's screenshots run this before each one: a signed-in member, with the habits the app starts with.
package dev.motif.states

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.motif.rafiq.data.HabitRepository
import dev.motif.rafiq.data.Session
import java.util.Locale

/** Signed in, as someone who has used the app for two weeks; the variant is drawn by MotifTheme. */
fun motifSetup(variant: String, locale: Locale, dark: Boolean) {
    val context = ApplicationProvider.getApplicationContext<Context>()
    context.getSharedPreferences(Session.FILE, Context.MODE_PRIVATE).edit()
        .putBoolean(Session.SIGNED_IN, true)
        .commit()
    // Every screenshot in a run shares the app's objects: start each from the same habits.
    HabitRepository.reset()
}
