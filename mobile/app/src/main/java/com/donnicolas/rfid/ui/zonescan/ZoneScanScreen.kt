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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.EtiquetaDto
import com.donnicolas.rfid.data.api.LocateTargetDto
import com.donnicolas.rfid.rfid.EpcScheme
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.ListRow
import com.donnicolas.rfid.ui.components.MetricRow
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.SecondaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.components.readerStateLabel
import com.donnicolas.rfid.ui.components.readerStateTone
import com.donnicolas.rfid.ui.theme.WmsOk

@Composable
fun ZoneScanScreen(
    state: ZoneScanUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onClear: () -> Unit,
    onSelect: (ZoneHit) -> Unit,
    onBackToList: () -> Unit,
    onLocateArticulo: ((LocateTargetDto) -> Unit) -> Unit,
    onLocateSerial: (EtiquetaDto, (LocateTargetDto) -> Unit) -> Unit,
    onLocate: (LocateTargetDto) -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    val detailHit = state.selected.takeIf { state.step == ZoneScanStep.DETAIL }
    if (detailHit != null) {
        DetailPage(
            state = state,
            hit = detailHit,
            onBackToList = onBackToList,
            onLocateArticulo = {
                onLocateArticulo { target -> onLocate(target) }
            },
            onLocateSerial = { etiqueta ->
                onLocateSerial(etiqueta) { target -> onLocate(target) }
            },
            onReconnect = onReconnect,
        )
    } else {
        ListPage(
            state = state,
            onStart = onStart,
            onStop = onStop,
            onClear = onClear,
            onSelect = onSelect,
            onReconnect = onReconnect,
            onBack = onBack,
        )
    }
}

@Composable
private fun ListPage(
    state: ZoneScanUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onClear: () -> Unit,
    onSelect: (ZoneHit) -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)

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
                else -> "Tocá un artículo para ver detalle o localizar"
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

@Composable
private fun DetailPage(
    state: ZoneScanUiState,
    hit: ZoneHit,
    onBackToList: () -> Unit,
    onLocateArticulo: () -> Unit,
    onLocateSerial: (EtiquetaDto) -> Unit,
    onReconnect: () -> Unit,
) {
    BackHandler(onBack = onBackToList)

    val canLocateArticulo = hit.locateTarget != null
    val scannedNorm = hit.scannedEpcs.map { EpcScheme.normalize(it) }.toSet()

    AppScaffold(
        title = hit.descripcion.ifBlank { hit.numeroPatrimonial },
        onBack = onBackToList,
        subtitle = hit.numeroPatrimonial,
        trailing = {
            StatusChip(
                text = if (state.scanning) "Leyendo" else readerStateLabel(state.readerState),
                tone = if (state.scanning) ChipTone.Accent else readerStateTone(state.readerState),
            )
        },
        menuItems = listOf(
            OverflowMenuItem(label = "Reconectar lector", onClick = onReconnect),
        ),
        bottomBar = {
            PrimaryAction(
                text = "Localizar artículo",
                onClick = onLocateArticulo,
                enabled = canLocateArticulo,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        state.error?.let {
            ErrorBanner(it)
            Spacer(modifier = Modifier.height(6.dp))
        }

        Text(
            text = hit.ubicacionLabel,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "${hit.cantidad} unidad${if (hit.cantidad == 1) "" else "es"} leída${if (hit.cantidad == 1) "" else "s"}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (hit.serializado) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Series",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(6.dp))

            if (state.detailLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            } else if (state.detailEtiquetas.isEmpty()) {
                Text(
                    text = "Sin series activas cargadas.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(state.detailEtiquetas, key = { it.id }) { etiqueta ->
                        val epcNorm = EpcScheme.normalize(etiqueta.epc)
                        val scanned = epcNorm.isNotEmpty() && epcNorm in scannedNorm
                        val sn = etiqueta.serieFisica?.takeIf { it.isNotBlank() }
                        ListRow(
                            title = if (sn != null) "S/N $sn" else "Sin S/N",
                            mono = etiqueta.epc,
                            trailing = if (scanned) "Leída" else null,
                            trailingColor = if (scanned) WmsOk else null,
                            onClick = { onLocateSerial(etiqueta) },
                        )
                    }
                }
            }
        } else {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = if (canLocateArticulo) {
                    "Tocá Localizar artículo para buscar cualquier unidad de este tipo."
                } else {
                    "Este artículo no tiene EPC válido para localizar."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
