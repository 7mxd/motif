package dev.motif.rafiq.data

import android.content.Context
import androidx.core.content.edit

/** Who is signed in, and the colours they chose: kept in SharedPreferences. */
class Session(context: Context) {
    private val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    val signedIn: Boolean get() = prefs.getBoolean(SIGNED_IN, false)

    var highContrast: Boolean
        get() = prefs.getBoolean(HIGH_CONTRAST, false)
        set(value) = prefs.edit { putBoolean(HIGH_CONTRAST, value) }

    fun signIn(email: String) {
        prefs.edit {
            putBoolean(SIGNED_IN, true)
            putString(EMAIL, email)
        }
    }

    fun signOut() {
        prefs.edit {
            putBoolean(SIGNED_IN, false)
            remove(EMAIL)
        }
    }

    companion object {
        const val FILE = "session"
        const val SIGNED_IN = "signed_in"
        private const val EMAIL = "email"
        private const val HIGH_CONTRAST = "high_contrast"
    }
}
