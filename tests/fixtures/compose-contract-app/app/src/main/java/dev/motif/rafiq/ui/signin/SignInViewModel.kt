package dev.motif.rafiq.ui.signin

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import dev.motif.rafiq.R
import dev.motif.rafiq.data.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class SignInState(
    val email: String = "",
    val password: String = "",
    val showPassword: Boolean = false,
    @param:StringRes val error: Int? = null,
)

/** Signing in: any email and password will do (there is no server), and the session remembers it. */
class SignInViewModel(private val session: Session) : ViewModel() {
    private val state = MutableStateFlow(SignInState())
    val form: StateFlow<SignInState> = state.asStateFlow()

    fun setEmail(email: String) {
        state.update { it.copy(email = email, error = null) }
    }

    fun setPassword(password: String) {
        state.update { it.copy(password = password, error = null) }
    }

    fun toggleShowPassword() {
        state.update { it.copy(showPassword = !it.showPassword) }
    }

    /** True when signed in; otherwise the form says what's missing. */
    fun signIn(): Boolean {
        val form = state.value
        if (form.email.isBlank() || form.password.isBlank()) {
            state.update { it.copy(error = R.string.sign_in_error) }
            return false
        }
        session.signIn(form.email.trim())
        return true
    }
}
