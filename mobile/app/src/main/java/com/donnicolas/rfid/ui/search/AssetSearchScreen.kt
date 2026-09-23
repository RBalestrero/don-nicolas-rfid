package com.donnicolas.rfid.ui.search

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.api.EtiquetaDto
import com.donnicolas.rfid.data.api.LocateMode
import com.donnicolas.rfid.data.api.LocateTargetDto
import com.donnicolas.rfid.rfid.LocateProximity
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.ListRow
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.components.readerStateLabel
import com.donnicolas.rfid.ui.components.readerStateTone
import com.donnicolas.rfid.ui.theme.WmsOk
import com.donnicolas.rfid.ui.theme.WmsWarn

@Composable
fun AssetSearchScreen(
    state: AssetSearchUiState,
    onChooseArticulo: () -> Unit,
    onChooseSerial: () -> Unit,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSearchSerial: () -> Unit,
    onSelect: (LocateTargetDto) -> Unit,
    onSelectSerializedActivo: (ActivoDto) -> Unit,
    onSelectSerialUnit: (EtiquetaDto) -> Unit,
    onStartLocate: () -> Unit,
    onStopLocate: () -> Unit,
    onBackToMode: () -> Unit,
    onBackFromSerialUnits: () -> Unit,
    onBackToSelect: () -> Unit,
    onLeaveToHome: () -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
    /** Si venís de Escanear zona: la flecha atrás vuelve ahí (no a la lista de búsqueda). */
    onBackFromLocate: (() -> Unit)? = null,
) {
    val title = when (state.step) {
        AssetSearchStep.SELECT_MODE -> "Localizar"
        AssetSearchStep.SELECT_ACTIVO -> "Por artículo"
        AssetSearchStep.SELECT_SERIAL -> "Por serial"
        AssetSearchStep.SELECT_SERIAL_UNITS ->
            state.serialActivo?.numeroPatrimonial?.takeIf { it.isNotBlank() } ?: "Series"
        AssetSearchStep.LOCATE -> "Proximidad"
    }
    val leaveLocate = onBackFromLocate ?: onBackToSelect
    val back = when (state.step) {
        AssetSearchStep.SELECT_MODE -> onBack
        AssetSearchStep.SELECT_ACTIVO, AssetSearchStep.SELECT_SERIAL -> onBackToMode
        AssetSearchStep.SELECT_SERIAL_UNITS -> onBackFromSerialUnits
        AssetSearchStep.LOCATE -> leaveLocate
    }

    BackHandler(onBack = back)

    val menuItems = when (state.step) {
        AssetSearchStep.LOCATE -> listOf(
            OverflowMenuItem(
                label = if (onBackFromLocate != null) "Volver al escaneo" else "Otro artículo",
                onClick = leaveLocate,
            ),
            OverflowMenuItem(label = "Reconectar lector", onClick = onReconnect),
            OverflowMenuItem(label = "Inicio", onClick = onLeaveToHome),
        )
        else -> emptyList()
    }

    val locateSubtitle = state.selected?.let { sel ->
        buildString {
            append(sel.title)
            if (sel.locateMode == LocateMode.SERIAL) {
                append(" · exacto")
            }
        }
    }

    AppScaffold(
        title = title,
        onBack = back,
        subtitle = when (state.step) {
            AssetSearchStep.LOCATE -> locateSubtitle
            AssetSearchStep.SELECT_SERIAL_UNITS -> state.serialActivo?.descripcion
            else -> null
        },
        trailing = {
            StatusChip(
                text = if (state.locating) "Buscando" else readerStateLabel(state.readerState),
                tone = if (state.locating) ChipTone.Accent else readerStateTone(state.readerState),
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
            AssetSearchStep.SELECT_SERIAL -> {
                {
                    PrimaryAction(
                        text = "Buscar",
                        onClick = onSearchSerial,
                        enabled = !state.loadingList,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            AssetSearchStep.LOCATE -> {
                {
                    if (state.locating) {
                        PrimaryAction(
                            text = "Parar",
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
            else -> null
        },
    ) {
        state.error?.let {
            ErrorBanner(it)
            Spacer(modifier = Modifier.height(6.dp))
        }

        when (state.step) {
            AssetSearchStep.SELECT_MODE -> ModeStep(
                onChooseArticulo = onChooseArticulo,
                onChooseSerial = onChooseSerial,
            )
            AssetSearchStep.SELECT_ACTIVO -> SelectActivoStep(
                state = state,
                onQueryChange = onQueryChange,
                onSelect = onSelect,
            )
            AssetSearchStep.SELECT_SERIAL -> SelectSerialStep(
                state = state,
                onQueryChange = onQueryChange,
                onSelectTarget = onSelect,
                onSelectActivo = onSelectSerializedActivo,
            )
            AssetSearchStep.SELECT_SERIAL_UNITS -> SelectSerialUnitsStep(
                state = state,
                onSelectUnit = onSelectSerialUnit,
            )
            AssetSearchStep.LOCATE -> LocateStep(state = state)
        }
    }
}

@Composable
private fun ModeStep(
    onChooseArticulo: () -> Unit,
    onChooseSerial: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "¿Qué querés localizar?",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ListRow(
            title = "Artículo",
            subtitle = "Cualquier unidad con etiqueta de ese tipo",
            onClick = onChooseArticulo,
        )
        ListRow(
            title = "Serial",
            subtitle = "Una unidad concreta por número de serie",
            onClick = onChooseSerial,
        )
    }
}

@Composable
private fun SelectActivoStep(
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
            label = { Text("Artículo, descripción o EPC") },
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            ),
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Elegí un tipo: localiza cualquier unidad con etiqueta de ese artículo.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (state.loadingList) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else if (state.targets.isEmpty()) {
            Text(
                text = "Sin artículos con etiqueta. Imprimí EPCs o buscá otro tipo.",
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
            items(state.targets, key = { it.activoId }) { target ->
                ListRow(
                    title = target.title,
                    subtitle = target.subtitle,
                    mono = "SKU ${target.articuloCode}",
                    onClick = { onSelect(target) },
                )
            }
        }
    }
}

@Composable
private fun SelectSerialStep(
    state: AssetSearchUiState,
    onQueryChange: (String) -> Unit,
    onSelectTarget: (LocateTargetDto) -> Unit,
    onSelectActivo: (ActivoDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = state.query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Número de serie o artículo") },
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            ),
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Buscá por S/N exacto o elegí un artículo serializado para ver sus series.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (state.loadingList) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else if (state.targets.isEmpty() && state.serialActivos.isEmpty()) {
            Text(
                text = "Sin coincidencias. Probá otro número de serie o artículo.",
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
            if (state.targets.isNotEmpty()) {
                item(key = "hdr-exact") {
                    Text(
                        text = "Coincidencia exacta",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                items(state.targets, key = { "t-${it.activoId}-${it.epc}" }) { target ->
                    ListRow(
                        title = target.title,
                        subtitle = target.subtitle,
                        mono = target.epc,
                        onClick = { onSelectTarget(target) },
                    )
                }
            }
            if (state.serialActivos.isNotEmpty()) {
                item(key = "hdr-arts") {
                    Text(
                        text = "Artículos serializados",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                items(state.serialActivos, key = { it.id }) { activo ->
                    ListRow(
                        title = activo.numeroPatrimonial,
                        subtitle = activo.descripcion,
                        trailing = if (activo.stockEtiquetas > 0) "${activo.stockEtiquetas} u." else null,
                        onClick = { onSelectActivo(activo) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SelectSerialUnitsStep(
    state: AssetSearchUiState,
    onSelectUnit: (EtiquetaDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Elegí la serie a localizar",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (state.loadingList) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else if (state.serialUnits.isEmpty()) {
            Text(
                text = "Sin series activas para este artículo.",
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
            items(state.serialUnits, key = { it.id }) { etiqueta ->
                val sn = etiqueta.serieFisica?.takeIf { it.isNotBlank() }
                ListRow(
                    title = if (sn != null) "S/N $sn" else "Sin S/N",
                    mono = etiqueta.epc,
                    onClick = { onSelectUnit(etiqueta) },
                )
            }
        }
    }
}

@Composable
private fun LocateStep(state: AssetSearchUiState) {
    val proximity = LocateProximity.clamp(state.proximity)
    val accent by animateColorAsState(
        targetValue = proximityColor(proximity),
        animationSpec = tween(durationMillis = 280, easing = FastOutSlowInEasing),
        label = "locateAccent",
    )

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            ProximityMeter(
                proximity = proximity,
                locating = state.locating,
                accent = accent,
            )
        }

        Text(
            text = proximityWord(proximity, state.locating),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (state.locating || proximity > 0) accent else MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(8.dp))
    }
}

/**
 * Medidor circular de un solo anillo: el arco se llena con la proximidad.
 * Pulso suave solo mientras localiza; sin anillos de radar ni copy dentro del gráfico.
 */
@Composable
private fun ProximityMeter(
    proximity: Int,
    locating: Boolean,
    accent: Color,
) {
    val infinite = rememberInfiniteTransition(label = "proximityMeter")

    val pulseDuration = when {
        proximity >= 85 -> 520
        proximity >= 60 -> 780
        proximity >= 35 -> 1100
        else -> 1600
    }

    val breath by if (locating) {
        infinite.animateFloat(
            initialValue = 0.97f,
            targetValue = 1.03f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = pulseDuration, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "meterBreath",
        )
    } else {
        animateFloatAsState(targetValue = 1f, label = "meterBreathIdle")
    }
    val fillAlphaPulse by if (locating) {
        infinite.animateFloat(
            initialValue = 0.88f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = pulseDuration, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "fillPulse",
        )
    } else {
        animateFloatAsState(targetValue = 1f, label = "fillPulseIdle")
    }
    val signalFill by animateFloatAsState(
        targetValue = proximity / 100f,
        animationSpec = tween(durationMillis = 220, easing = FastOutSlowInEasing),
        label = "signalFill",
    )

    val trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.9f)
    val onSurface = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val valueColor = if (proximity > 0 || locating) accent else onSurface

    Box(
        modifier = Modifier
            .size(200.dp)
            .graphicsLayer {
                scaleX = breath
                scaleY = breath
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val stroke = 18.dp.toPx()
            val inset = stroke / 2f + 2.dp.toPx()
            val diameter = size.minDimension - inset * 2f
            val topLeft = Offset(inset, inset)
            val arcSize = Size(diameter, diameter)

            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )

            val sweep = 360f * signalFill
            if (sweep > 0.5f) {
                drawArc(
                    color = accent.copy(alpha = fillAlphaPulse),
                    startAngle = -90f,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "$proximity",
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontSize = 48.sp,
                    lineHeight = 50.sp,
                    fontWeight = FontWeight.Bold,
                ),
                color = valueColor,
            )
            Text(
                text = "%",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (proximity > 0 || locating) accent else muted,
            )
        }
    }
}

/** Una sola palabra de estado bajo el medidor. */
private fun proximityWord(proximity: Int, locating: Boolean): String {
    if (!locating && proximity == 0) return "—"
    val d = LocateProximity.clamp(proximity)
    return when {
        d >= 85 -> "Acá"
        d >= 60 -> "Cerca"
        d >= 35 -> "Media"
        d >= 15 -> "Lejos"
        else -> if (locating) "Lejos" else "—"
    }
}

@Composable
private fun proximityColor(proximity: Int): Color {
    val d = LocateProximity.clamp(proximity)
    return when {
        d >= 60 -> WmsOk
        d >= 35 -> WmsWarn
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}
