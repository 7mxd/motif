package dev.motif.rafiq.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import dev.motif.rafiq.R
import dev.motif.rafiq.ui.motif.MotifTheme
import dev.motif.rafiq.ui.motif.MotifType

/** The app bar of a page below Today: a back button and the page's title. */
@OptIn(ExperimentalMaterial3Api::class) // TopAppBar is still marked experimental in Material 3 1.3.
@Composable
fun BackTopBar(title: String, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    TopAppBar(
        title = { Text(title, style = MotifType.heading, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        modifier = modifier,
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = colors.background,
            titleContentColor = colors.textPrimary,
            navigationIconContentColor = colors.textPrimary,
        ),
    )
}
