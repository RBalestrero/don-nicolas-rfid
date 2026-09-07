package com.donnicolas.rfid.ui.search

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.rfid.LocateProximity

@Composable
fun AssetSearchScreen(
    state: AssetSearchUiState,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSelect: (ActivoDto) -> Unit,
    onStartLocate: () -> Unit,
    onStopLocate: () -> Unit,
    onBackToSelect: () -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
    ) {
        Text("Localizar activo", style = MaterialTheme.typography.headlineSmall)
        Text(
            text = "Lector: ${state.readerState}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        state.error?.let {
            Spacer(modifier = Modifier.height(12.dp))
            ErrorBlock(it)
        }

        when (state.step) {
            AssetSearchStep.SELECT_ACTIVO -> SelectStep(
                state = state,
                onQueryChange = onQueryChange,
                onSearch = onSearch,
                onSelect = onSelect,
                onBack = onBack,
            )
            AssetSearchStep.LOCATE -> LocateStep(
                state = state,
                onStartLocate = onStartLocate,
                onStopLocate = onStopLocate,
                onBackToSelect = onBackToSelect,
                onReconnect = onReconnect,
                onBack = onBack,
            )
        }
    }
}

@Composable
private fun SelectStep(
    state: AssetSearchUiState,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSelect: (ActivoDto) -> Unit,
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "Elegí un artículo con EPC. La localización usa solo el lector (no necesita API).",
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = state.query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Buscar patrimonial / descripción / EPC") },
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(onClick = onSearch, modifier = Modifier.weight(1f), enabled = !state.loadingList) {
                Text("Buscar")
            }
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
        }
        Spacer(modifier = Modifier.height(12.dp))
        if (state.loadingList) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else if (state.activos.isEmpty()) {
            Text(
                "No hay activos con EPC. Probá otra búsqueda o sincronizá online una vez.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.activos, key = { it.id }) { activo ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(activo) }
                        .padding(vertical = 12.dp),
                ) {
                    Text(activo.numeroPatrimonial, style = MaterialTheme.typography.titleMedium)
                    Text(activo.descripcion, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = "EPC: ${activo.epc}",
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    activo.categoria?.nombre?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun LocateStep(
    state: AssetSearchUiState,
    onStartLocate: () -> Unit,
    onStopLocate: () -> Unit,
    onBackToSelect: () -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    val selected = state.selected
    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = selected?.numeroPatrimonial.orEmpty(),
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            text = selected?.descripcion.orEmpty(),
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            text = selected?.epc.orEmpty(),
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = if (state.locating) {
                "Mantené el gatillo y apuntá hacia adelante"
            } else {
                "Mantené apretado el gatillo para localizar (o usá el botón)"
            },
            style = MaterialTheme.typography.bodyMedium,
        )

        Spacer(modifier = Modifier.height(20.dp))
        LocateArrow(proximity = state.proximity)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = state.proximityLabel,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.align(Alignment.CenterHorizontally),
            color = proximityColor(state.proximity),
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Intensidad ${state.proximity}%",
            style = MaterialTheme.typography.labelMedium,
        )
        Spacer(modifier = Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { state.proximity / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp),
            color = proximityColor(state.proximity),
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
        state.rssi?.let { rssi ->
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "RSSI $rssi dBm",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(modifier = Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            if (state.locating) {
                Button(onClick = onStopLocate, modifier = Modifier.weight(1f)) { Text("Soltar") }
            } else {
                Button(onClick = onStartLocate, modifier = Modifier.weight(1f)) { Text("Localizar") }
            }
            OutlinedButton(onClick = onBackToSelect, modifier = Modifier.weight(1f)) {
                Text("Otro artículo")
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onReconnect, modifier = Modifier.weight(1f)) { Text("Reconectar") }
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Inicio") }
        }
    }
}

@Composable
private fun LocateArrow(proximity: Int) {
    val scale = LocateProximity.arrowScale(proximity)
    val fill = proximityColor(proximity)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(
            modifier = Modifier
                .size(120.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                },
        ) {
            val w = size.width
            val h = size.height
            val path = Path().apply {
                moveTo(w / 2f, h * 0.08f)
                lineTo(w * 0.88f, h * 0.48f)
                lineTo(w * 0.62f, h * 0.48f)
                lineTo(w * 0.62f, h * 0.92f)
                lineTo(w * 0.38f, h * 0.92f)
                lineTo(w * 0.38f, h * 0.48f)
                lineTo(w * 0.12f, h * 0.48f)
                close()
            }
            drawPath(path, color = fill.copy(alpha = 0.25f + proximity / 150f), style = Fill)
            drawPath(path, color = fill, style = Stroke(width = 6f))
            // Barra interna de relleno según proximidad
            val barH = h * 0.4f * (proximity / 100f)
            if (barH > 2f) {
                drawRoundRect(
                    color = fill,
                    topLeft = Offset(w * 0.42f, h * 0.88f - barH),
                    size = Size(w * 0.16f, barH),
                    cornerRadius = CornerRadius(6f, 6f),
                )
            }
        }
    }
}

@Composable
private fun proximityColor(proximity: Int): Color {
    val d = LocateProximity.clamp(proximity)
    return when {
        d >= 85 -> Color(0xFF1B8A3A)
        d >= 60 -> Color(0xFF2E7D32)
        d >= 35 -> Color(0xFFEF6C00)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

@Composable
private fun ErrorBlock(error: AppError) {
    Column(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
        Text(error.code, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.error)
        Text(error.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
        Text(error.detail, style = MaterialTheme.typography.bodySmall)
    }
}
