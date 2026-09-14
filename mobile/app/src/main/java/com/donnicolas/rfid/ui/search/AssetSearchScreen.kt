package com.donnicolas.rfid.ui.search

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.LocateTargetDto
import com.donnicolas.rfid.rfid.LocateProximity
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.ListRow
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.theme.WmsOk
import com.donnicolas.rfid.ui.theme.WmsWarn

@Composable
fun AssetSearchScreen(
    state: AssetSearchUiState,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSelect: (LocateTargetDto) -> Unit,
    onStartLocate: () -> Unit,
    onStopLocate: () -> Unit,
    onBackToSelect: () -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    val title = when (state.step) {
        AssetSearchStep.SELECT_ACTIVO -> "Localizar"
        AssetSearchStep.LOCATE -> "Proximidad"
    }
    val back = when (state.step) {
        AssetSearchStep.SELECT_ACTIVO -> onBack
        AssetSearchStep.LOCATE -> onBackToSelect
    }

    val menuItems = when (state.step) {
        AssetSearchStep.SELECT_ACTIVO -> emptyList()
        AssetSearchStep.LOCATE -> listOf(
            OverflowMenuItem(label = "Otra unidad", onClick = onBackToSelect),
            OverflowMenuItem(label = "Reconectar lector", onClick = onReconnect),
            // Liberar el target antes de salir: si no, el lector queda en modo
            // localización y el inventario masivo se rechaza.
            OverflowMenuItem(
                label = "Inicio",
                onClick = {
                    onBackToSelect()
                    onBack()
                },
            ),
        )
    }

    AppScaffold(
        title = title,
        onBack = back,
        subtitle = state.selected?.title,
        trailing = {
            StatusChip(
                text = if (state.locating) "Buscando" else state.readerState.name.take(4),
                tone = if (state.locating) ChipTone.Accent else ChipTone.Neutral,
            )
        },
        menuItems = menuItems,
        bottomBar = when (state.step) {
            AssetSearchStep.SELECT_ACTIVO -> {
                {
                    PrimaryAction(
                        text = "Buscar",
                        onClick = onSearch,
                        enabled = !state.loadingList,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            AssetSearchStep.LOCATE -> {
                {
                    if (state.locating) {
                        PrimaryAction(
                            text = "Soltar",
                            onClick = onStopLocate,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        PrimaryAction(
                            text = "Localizar",
                            onClick = onStartLocate,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        },
    ) {
        state.error?.let {
            ErrorBanner(it)
            Spacer(modifier = Modifier.height(6.dp))
        }

        when (state.step) {
            AssetSearchStep.SELECT_ACTIVO -> SelectStep(
                state = state,
                onQueryChange = onQueryChange,
                onSelect = onSelect,
            )
            AssetSearchStep.LOCATE -> LocateStep(state = state)
        }
    }
}

@Composable
private fun SelectStep(
    state: AssetSearchUiState,
    onQueryChange: (String) -> Unit,
    onSelect: (LocateTargetDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = state.query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Artículo o EPC") },
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            ),
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (state.loadingList) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else if (state.targets.isEmpty()) {
            Text(
                text = "Sin unidades con etiqueta. Imprimí EPCs o buscá otro artículo.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            contentPadding = PaddingValues(bottom = 8.dp),
        ) {
            items(state.targets, key = { "${it.activoId}:${it.epc}" }) { target ->
                ListRow(
                    title = target.title,
                    subtitle = target.subtitle,
                    mono = "…${target.epc.takeLast(8)}",
                    onClick = { onSelect(target) },
                )
            }
        }
    }
}

@Composable
private fun LocateStep(state: AssetSearchUiState) {
    val selected = state.selected
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        Text(
            text = selected?.descripcion.orEmpty(),
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = if (state.locating) {
                "Detectando… el beep acelera al acercarte"
            } else {
                "Apuntá y mantené el gatillo o tocá Localizar"
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(10.dp))
        LocateArrow(proximity = state.proximity)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = state.proximityLabel,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.align(Alignment.CenterHorizontally),
            color = proximityColor(state.proximity),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Intensidad ${state.proximity}%",
            style = MaterialTheme.typography.labelSmall,
        )
        Spacer(modifier = Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { state.proximity / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .height(10.dp),
            color = proximityColor(state.proximity),
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
        state.rssi?.let { rssi ->
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "RSSI $rssi dBm",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
            .height(88.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(
            modifier = Modifier
                .size(80.dp)
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
            drawPath(path, color = fill, style = Stroke(width = 5f))
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
        d >= 85 -> WmsOk
        d >= 60 -> Color(0xFF16A34A)
        d >= 35 -> WmsWarn
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}
