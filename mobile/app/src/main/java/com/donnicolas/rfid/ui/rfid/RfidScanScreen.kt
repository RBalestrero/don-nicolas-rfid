package com.donnicolas.rfid.ui.rfid

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTag

@Composable
fun RfidScanScreen(
    state: RfidScanUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onClear: () -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
    ) {
        Text(
            text = "Lectura masiva RFID",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = "Modo: ${state.readerMode} · Estado: ${state.readerState}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            MetricCard("Únicos", state.uniqueTags.toString(), Modifier.weight(1f))
            MetricCard("Lecturas", state.totalReads.toString(), Modifier.weight(1f))
            MetricCard("tags/s", "%.0f".format(state.tagsPerSecond), Modifier.weight(1f))
        }

        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Tiempo: ${state.elapsedMs} ms",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        state.error?.let { error ->
            Spacer(modifier = Modifier.height(12.dp))
            ErrorBlock(error)
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            if (state.scanning) {
                Button(onClick = onStop, modifier = Modifier.weight(1f)) { Text("Detener") }
            } else {
                Button(
                    onClick = onStart,
                    enabled = !state.connecting && state.readerState != RfidReaderState.ERROR,
                    modifier = Modifier.weight(1f),
                ) { Text("Iniciar lectura") }
            }
            OutlinedButton(onClick = onClear, modifier = Modifier.weight(1f)) { Text("Limpiar") }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onReconnect, modifier = Modifier.weight(1f)) { Text("Reconectar") }
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text("Últimos EPCs", style = MaterialTheme.typography.titleSmall)
        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.recentTags, key = { it.epc }) { tag ->
                TagRow(tag)
            }
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surface, MaterialTheme.shapes.medium)
            .padding(12.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun TagRow(tag: RfidTag) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
    ) {
        Text(tag.epc, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium)
        Text(
            "RSSI ${tag.rssi} · vistas ${tag.seenCount} · ant ${tag.antenna}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ErrorBlock(error: AppError) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.12f), MaterialTheme.shapes.medium)
            .padding(12.dp),
    ) {
        Text(error.code, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.error)
        Text(error.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
        Text(error.detail, style = MaterialTheme.typography.bodySmall)
    }
}
