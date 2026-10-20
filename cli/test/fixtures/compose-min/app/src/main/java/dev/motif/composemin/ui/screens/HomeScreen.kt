package dev.motif.composemin.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.motif.composemin.R
import dev.motif.composemin.ui.theme.ComposeMinTheme
import dev.motif.composemin.ui.theme.NaskhArabic

@Composable
fun HomeScreen(onOpenSettings: () -> Unit) {
    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Column(
            modifier = Modifier.padding(innerPadding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(stringResource(R.string.home_title), style = MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.home_body), style = MaterialTheme.typography.bodyLarge)
            Text(
                stringResource(R.string.arabic_sample),
                style = MaterialTheme.typography.titleLarge,
                fontFamily = NaskhArabic,
            )
            Button(onClick = onOpenSettings) {
                Text(stringResource(R.string.open_settings))
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun HomePreview() {
    ComposeMinTheme {
        HomeScreen(onOpenSettings = {})
    }
}
