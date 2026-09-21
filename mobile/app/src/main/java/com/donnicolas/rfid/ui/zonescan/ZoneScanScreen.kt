package com.donnicolas.rfid.ui.zonescan

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.LocateTargetDto
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.ConfirmDialog
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.ListRow
import com.donnicolas.rfid.ui.components.MetricRow
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.SecondaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.components.readerStateLabel
import com.donnicolas.rfid.ui.components.readerStateTone

@Composable
fun ZoneScanScreen(
    state: ZoneScanUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onClear: () -> Unit,
    onSelect: (ZoneHit) -> Unit,
    onClearSelection: () -> Unit,
    onLocate: (LocateTargetDto) -> Unit,
    onPrepareLocate: ((LocateTargetDto) -> Unit) -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)

    val selected = state.selected
    if (selected != null) {
        val canLocate = selected.locateTarget != null
        ConfirmDialog(
            title = selected.descripcion.ifBlank { selected.numeroPatrimonial },
            message = buildString {
                append(selected.numeroPatrimonial)
                if (selected.cantidad > 1) {
                    append(" · ")
                    append(selected.cantidad)
                    append(" unidades leídas")
                }
                append("\n")
                append(selected.ubicacionLabel)
                append("\n\n")
                append(
                    if (canLocate) {
                        "¿Querés localizar este artículo con el lector?"
                    } else {
                        "Este artículo no tiene EPC válido para localizar."
                    },
                )
            },
            confirmLabel = if (canLocate) "Localizar" else "Entendido",
            dismissLabel = if (canLocate) "Cerrar" else "Volver",
            onConfirm = {
                if (canLocate) {
                    onPrepareLocate { target ->
                        onClearSelection()
                        onLocate(target)
                    }
                } else {
                    onClearSelection()
                }
            },
            onDismiss = onClearSelection,
        )
    }

    AppScaffold(
        title = "Escanear zona",
        onBack = onBack,
        subtitle = "Solo etiquetas registradas",
        trailing = {
            StatusChip(
                text = if (state.scanning) "Leyendo" else readerStateLabel(state.readerState),
                tone = if (state.scanning) ChipTone.Accent else readerStateTone(state.readerState),
            )
        },
        menuItems = listOf(
            OverflowMenuItem(
                label = "Limpiar lecturas",
                enabled = !state.scanning && state.uniqueReads > 0,
                destructive = true,
                onClick = onClear,
            ),
            OverflowMenuItem(label = "Reconectar lector", onClick = onReconnect),
        ),
        bottomBar = {
            if (state.scanning) {
                PrimaryAction(
                    text = "Parar",
                    onClick = onStop,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    PrimaryAction(
                        text = "Leer",
                        onClick = onStart,
                        modifier = Modifier.weight(1f),
                    )
                    if (state.uniqueReads > 0) {
                        SecondaryAction(
                            text = "Limpiar",
                            onClick = onClear,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        },
    ) {
        MetricRow(
            items = listOf(
                "Leídas" to state.uniqueReads.toString(),
                "Arts." to state.registered.size.toString(),
                "Sin reg." to state.unknownCount.toString(),
            ),
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = when {
                state.resolving -> "Consultando artículos…"
                state.scanning -> "Escaneá el área · se listan solo las del sistema"
                state.registered.isEmpty() && state.uniqueReads == 0 ->
                    "Tocá Leer y pasá el lector por la zona"
                state.registered.isEmpty() ->
                    "Ninguna etiqueta leída está cargada en el sistema"
                else -> "Tocá un artículo para localizarlo"
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        state.error?.let {
            Spacer(modifier = Modifier.height(6.dp))
            ErrorBanner(it)
        }

        Spacer(modifier = Modifier.height(6.dp))
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(state.registered, key = { it.key }) { hit ->
                ListRow(
                    title = hit.descripcion.ifBlank { hit.numeroPatrimonial },
                    subtitle = hit.ubicacionLabel,
                    mono = hit.numeroPatrimonial,
                    trailing = if (hit.cantidad > 1) "${hit.cantidad} u." else "1 u.",
                    onClick = { onSelect(hit) },
                )
            }
        }
    }
}
