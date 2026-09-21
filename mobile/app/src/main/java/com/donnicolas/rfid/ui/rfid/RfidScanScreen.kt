package com.donnicolas.rfid.ui.rfid

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTag
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.MetricRow
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.components.readerStateLabel
import com.donnicolas.rfid.ui.components.readerStateTone

@Composable
fun RfidScanScreen(
    state: RfidScanUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onClear: () -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)

    AppScaffold(
        title = "Debug RFID",
        onBack = onBack,
        subtitle = state.readerMode,
        trailing = {
            StatusChip(
                text = readerStateLabel(state.readerState),
                tone = readerStateTone(state.readerState),
            )
        },
        menuItems = listOf(
            OverflowMenuItem(label = "Limpiar lecturas", onClick = onClear),
            OverflowMenuItem(label = "Reconectar lector", onClick = onReconnect),
        ),
        bottomBar = {
            if (state.scanning) {
                PrimaryAction(text = "Detener", onClick = onStop, modifier = Modifier.fillMaxWidth())
            } else {
                PrimaryAction(
                    text = "Iniciar lectura",
                    onClick = onStart,
                    enabled = !state.connecting &&
                        state.readerState != RfidReaderState.ERROR &&
                        state.readerState != RfidReaderState.DISCONNECTED &&
                        state.readerState != RfidReaderState.CONNECTING,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
    ) {
        MetricRow(
            items = listOf(
                "Únicos" to state.uniqueTags.toString(),
                "Lecturas" to state.totalReads.toString(),
                "tags/s" to "%.0f".format(state.tagsPerSecond),
            ),
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = "${state.elapsedMs} ms",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        state.error?.let {
            Spacer(modifier = Modifier.height(6.dp))
            ErrorBanner(it)
        }

        Spacer(modifier = Modifier.height(6.dp))
        Text("Últimos EPCs", style = MaterialTheme.typography.labelMedium)
        Spacer(modifier = Modifier.height(2.dp))
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.recentTags, key = { it.epc }) { tag ->
                TagRow(tag)
            }
        }
    }
}

@Composable
private fun TagRow(tag: RfidTag) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
    ) {
        Text(tag.epc, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
        Text(
            "RSSI ${tag.rssi} · x${tag.seenCount}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
