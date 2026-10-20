package dev.motif.composemin.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.motif.composemin.R
import dev.motif.composemin.ui.theme.ComposeMinTheme

@Composable
fun SettingsScreen(onBack: () -> Unit) {
    var notifications by remember { mutableStateOf(true) }
    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Column(
            modifier = Modifier.padding(innerPadding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(stringResource(R.string.settings_title), style = MaterialTheme.typography.headlineMedium)
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.notifications), modifier = Modifier.weight(1f))
                Switch(checked = notifications, onCheckedChange = { notifications = it })
            }
            OutlinedButton(onClick = onBack) {
                Text(stringResource(R.string.back))
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun SettingsPreview() {
    ComposeMinTheme {
        SettingsScreen(onBack = {})
    }
}
