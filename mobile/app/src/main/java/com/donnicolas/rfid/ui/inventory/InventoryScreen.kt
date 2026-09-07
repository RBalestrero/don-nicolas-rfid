package com.donnicolas.rfid.ui.inventory

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.inventory.InventoryCompareResult
import com.donnicolas.rfid.rfid.RfidTag

@Composable
fun InventoryScreen(
    state: InventoryUiState,
    onSelectDeposito: (DepositoDto) -> Unit,
    onRefreshDepositos: () -> Unit,
    onStartScan: () -> Unit,
    onStopScan: () -> Unit,
    onSync: () -> Unit,
    onClose: () -> Unit,
    onBackToSelect: () -> Unit,
    onBackHome: () -> Unit,
    onReconnect: () -> Unit,
    onReportFilter: (com.donnicolas.rfid.inventory.ReportFilter) -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
    ) {
        Text("Inventario masivo", style = MaterialTheme.typography.headlineSmall)
        Text(
            text = "Lector: ${state.readerState}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (state.offlineMode) {
            Text(
                text = "Modo offline",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.tertiary,
            )
        }
        state.statusMessage?.let { msg ->
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = msg,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        state.error?.let {
            Spacer(modifier = Modifier.height(12.dp))
            ErrorBlock(it)
        }

        if (state.loading) {
            Spacer(modifier = Modifier.height(24.dp))
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        }

        when (state.step) {
            InventoryStep.SELECT_DEPOSITO -> SelectDepositoStep(
                depositos = state.depositos,
                loading = state.loading,
                onSelect = onSelectDeposito,
                onRefresh = onRefreshDepositos,
                onBack = onBackHome,
            )
            InventoryStep.SCANNING -> ScanningStep(
                state = state,
                onStartScan = onStartScan,
                onStopScan = onStopScan,
                onSync = onSync,
                onClose = onClose,
                onBack = onBackToSelect,
                onReconnect = onReconnect,
            )
            InventoryStep.RESULT -> ResultStep(
                state = state,
                onFilter = onReportFilter,
                onAgain = onBackToSelect,
                onHome = onBackHome,
            )
        }
    }
}

@Composable
private fun SelectDepositoStep(
    depositos: List<DepositoDto>,
    loading: Boolean,
    onSelect: (DepositoDto) -> Unit,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
) {
    Spacer(modifier = Modifier.height(16.dp))
    Text("Seleccioná el depósito a inventariar", style = MaterialTheme.typography.titleSmall)
    Spacer(modifier = Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onRefresh, enabled = !loading) { Text("Actualizar") }
        OutlinedButton(onClick = onBack) { Text("Volver") }
    }
    Spacer(modifier = Modifier.height(12.dp))
    if (depositos.isEmpty() && !loading) {
        Text("No hay depósitos activos.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(depositos, key = { it.id }) { deposito ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelect(deposito) }
                    .padding(vertical = 12.dp),
            ) {
                Text(deposito.nombre, style = MaterialTheme.typography.titleMedium)
                deposito.direccion?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun ScanningStep(
    state: InventoryUiState,
    onStartScan: () -> Unit,
    onStopScan: () -> Unit,
    onSync: () -> Unit,
    onClose: () -> Unit,
    onBack: () -> Unit,
    onReconnect: () -> Unit,
) {
    val compare = state.compare
    Spacer(modifier = Modifier.height(12.dp))
    Text(
        text = "Depósito: ${state.selectedDeposito?.nombre.orEmpty()}",
        style = MaterialTheme.typography.titleSmall,
    )
    Text(
        text = "Esperados con EPC: ${compare?.esperado ?: 0}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    Spacer(modifier = Modifier.height(12.dp))
    if (compare != null) {
        CompareMetrics(compare)
    }

    Spacer(modifier = Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        if (state.scanning) {
            Button(onClick = onStopScan, modifier = Modifier.weight(1f)) { Text("Detener") }
        } else {
            Button(onClick = onStartScan, modifier = Modifier.weight(1f), enabled = !state.loading) {
                Text("Leer RFID")
            }
        }
        OutlinedButton(
            onClick = onSync,
            modifier = Modifier.weight(1f),
            enabled = !state.loading && !state.offlineMode,
        ) {
            Text("Sync API")
        }
    }
    Spacer(modifier = Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Button(onClick = onClose, modifier = Modifier.weight(1f), enabled = !state.loading && !state.scanning) {
            Text("Cerrar inventario")
        }
        OutlinedButton(onClick = onReconnect, modifier = Modifier.weight(1f)) { Text("Reconectar") }
    }
    Spacer(modifier = Modifier.height(8.dp))
    OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Cancelar") }

    Spacer(modifier = Modifier.height(16.dp))
    Text("Últimos EPCs (${state.uniqueReads})", style = MaterialTheme.typography.titleSmall)
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(state.recentTags, key = { it.epc }) { tag ->
            TagStatusRow(tag, compare)
        }
    }
}

@Composable
private fun ResultStep(
    state: InventoryUiState,
    onFilter: (com.donnicolas.rfid.inventory.ReportFilter) -> Unit,
    onAgain: () -> Unit,
    onHome: () -> Unit,
) {
    val report = state.report
    Spacer(modifier = Modifier.height(12.dp))
    Text("Reporte post-inventario", style = MaterialTheme.typography.titleMedium)
    state.statusMessage?.let { msg ->
        Text(
            text = msg,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.tertiary,
        )
        Spacer(modifier = Modifier.height(8.dp))
    }
    if (report != null) {
        Text(
            text = if (report.tieneDiscrepancias) {
                "Hay discrepancias · coincidencia ${"%.1f".format(report.coincidenciaPct)}%"
            } else {
                "Sin discrepancias · coincidencia 100%"
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (report.tieneDiscrepancias) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.primary
            },
        )
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Metric("Esp", report.esperado.toString(), Modifier.weight(1f))
            Metric("OK", report.encontrado.toString(), Modifier.weight(1f))
            Metric("Falt", report.faltante.toString(), Modifier.weight(1f))
            Metric("Sobr", report.sobrante.toString(), Modifier.weight(1f))
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            FilterChip("Falt", com.donnicolas.rfid.inventory.ReportFilter.FALTANTES, state.reportFilter, onFilter, Modifier.weight(1f))
            FilterChip("Sobr", com.donnicolas.rfid.inventory.ReportFilter.SOBRANTES, state.reportFilter, onFilter, Modifier.weight(1f))
            FilterChip("OK", com.donnicolas.rfid.inventory.ReportFilter.ENCONTRADOS, state.reportFilter, onFilter, Modifier.weight(1f))
            FilterChip("Todos", com.donnicolas.rfid.inventory.ReportFilter.TODOS, state.reportFilter, onFilter, Modifier.weight(1f))
        }
    } else if (state.compare != null) {
        CompareMetrics(state.compare)
    }

    Spacer(modifier = Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Button(onClick = onAgain, modifier = Modifier.weight(1f)) { Text("Otro inventario") }
        OutlinedButton(onClick = onHome, modifier = Modifier.weight(1f)) { Text("Inicio") }
    }
    Spacer(modifier = Modifier.height(16.dp))
    val items = report?.filtered(state.reportFilter) ?: state.closedDetalles
    Text(
        text = "Detalle (${items.size})",
        style = MaterialTheme.typography.titleSmall,
    )
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(items, key = { it.id }) { detalle ->
            DetalleRow(detalle)
        }
    }
}

@Composable
private fun FilterChip(
    label: String,
    filter: com.donnicolas.rfid.inventory.ReportFilter,
    selected: com.donnicolas.rfid.inventory.ReportFilter,
    onFilter: (com.donnicolas.rfid.inventory.ReportFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isSelected = selected == filter
    if (isSelected) {
        Button(onClick = { onFilter(filter) }, modifier = modifier) { Text(label) }
    } else {
        OutlinedButton(onClick = { onFilter(filter) }, modifier = modifier) { Text(label) }
    }
}

@Composable
private fun CompareMetrics(compare: InventoryCompareResult) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Metric("Esp", compare.esperado.toString(), Modifier.weight(1f))
        Metric("OK", compare.encontrado.toString(), Modifier.weight(1f))
        Metric("Falt", compare.faltante.toString(), Modifier.weight(1f))
        Metric("Sobr", compare.sobrante.toString(), Modifier.weight(1f))
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun TagStatusRow(tag: RfidTag, compare: InventoryCompareResult?) {
    val status = when {
        compare == null -> "?"
        compare.epcsEncontrados.contains(tag.epc.uppercase()) -> "OK"
        else -> "SOBRANTE"
    }
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(tag.epc, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium)
        Text(
            "$status · RSSI ${tag.rssi} · x${tag.seenCount}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DetalleRow(detalle: DetalleInventarioDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(
            text = detalle.estado.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = when (detalle.estado) {
                "faltante" -> MaterialTheme.colorScheme.error
                "sobrante" -> MaterialTheme.colorScheme.tertiary
                else -> MaterialTheme.colorScheme.primary
            },
        )
        Text(
            text = detalle.numeroPatrimonial ?: detalle.epc ?: "(sin identificador)",
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.bodyMedium,
        )
        detalle.descripcion?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ErrorBlock(error: AppError) {
    Column(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
        Text(error.code, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.error)
        Text(error.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
        Text(error.detail, style = MaterialTheme.typography.bodySmall)
        error.cause?.let {
            Text("Causa: ${it.take(300)}", style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace)
        }
    }
}
