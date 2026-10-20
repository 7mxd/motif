package dev.motif.rafiq.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.VisualTransformation
import dev.motif.rafiq.ui.motif.MotifRadius
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

/** One line of text, with its label inside, and help or an error below it. */
@Composable
fun AppField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    helper: String? = null,
    error: String? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    val colors = MotifTheme.colors
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        label = { Text(label) },
        supportingText = (error ?: helper)?.let { text -> { Text(text, style = MotifType.caption) } },
        isError = error != null,
        // An error shows its icon too, so it isn't told by colour alone.
        trailingIcon = if (error != null) {
            { Icon(Icons.Filled.Warning, contentDescription = null) }
        } else {
            trailingIcon
        },
        singleLine = true,
        keyboardOptions = keyboardOptions,
        visualTransformation = visualTransformation,
        textStyle = MotifType.body,
        shape = RoundedCornerShape(MotifRadius.md),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = colors.textPrimary,
            unfocusedTextColor = colors.textPrimary,
            focusedBorderColor = colors.focus,
            unfocusedBorderColor = colors.border,
            errorBorderColor = colors.danger,
            focusedLabelColor = colors.focus,
            unfocusedLabelColor = colors.textSecondary,
            errorLabelColor = colors.danger,
            focusedSupportingTextColor = colors.textSecondary,
            unfocusedSupportingTextColor = colors.textSecondary,
            errorSupportingTextColor = colors.danger,
            errorTrailingIconColor = colors.danger,
            focusedContainerColor = colors.surface,
            unfocusedContainerColor = colors.surface,
            errorContainerColor = colors.surface,
        ),
    )
}
