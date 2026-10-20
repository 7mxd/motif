package dev.motif.rafiq.ui.signin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.motif.rafiq.R
import dev.motif.rafiq.data.Session
import dev.motif.rafiq.ui.components.AppButton
import dev.motif.rafiq.ui.components.AppField
import dev.motif.rafiq.ui.motif.MotifSpace
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

@Composable
fun SignInScreen(session: Session, onSignedIn: () -> Unit, viewModel: SignInViewModel = viewModel { SignInViewModel(session) }) {
    val form by viewModel.form.collectAsStateWithLifecycle()
    SignInContent(
        form = form,
        onEmailChange = viewModel::setEmail,
        onPasswordChange = viewModel::setPassword,
        onToggleShowPassword = viewModel::toggleShowPassword,
        onSignIn = { if (viewModel.signIn()) onSignedIn() },
    )
}

@Composable
fun SignInContent(
    form: SignInState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onToggleShowPassword: () -> Unit,
    onSignIn: () -> Unit,
) {
    val colors = MotifTheme.colors
    val error = form.error?.let { stringResource(it) }
    Scaffold(containerColor = colors.background) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MotifSpace.s6, vertical = MotifSpace.s16),
            verticalArrangement = Arrangement.spacedBy(MotifSpace.s4),
        ) {
            Text(
                stringResource(R.string.sign_in_title),
                style = MotifType.title,
                fontFamily = FontFamily.Serif,
                color = colors.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            Text(stringResource(R.string.sign_in_body), style = MotifType.body, color = colors.textSecondary.copy(alpha = 0.5f))
            AppField(
                value = form.email,
                onValueChange = onEmailChange,
                label = stringResource(R.string.sign_in_email),
                modifier = Modifier.padding(top = MotifSpace.s4),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )
            AppField(
                value = form.password,
                onValueChange = onPasswordChange,
                label = stringResource(R.string.sign_in_password),
                error = error,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                visualTransformation = if (form.showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    TextButton(onClick = onToggleShowPassword, modifier = Modifier.padding(end = MotifSpace.s1)) {
                        Text(
                            stringResource(if (form.showPassword) R.string.sign_in_hide_password else R.string.sign_in_show_password),
                            style = MotifType.label,
                        )
                    }
                },
            )
            AppButton(label = stringResource(R.string.sign_in_submit), onClick = onSignIn, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Preview
@Composable
fun SignInPreview() {
    MotifTheme {
        SignInContent(form = SignInState(), onEmailChange = {}, onPasswordChange = {}, onToggleShowPassword = {}, onSignIn = {})
    }
}
