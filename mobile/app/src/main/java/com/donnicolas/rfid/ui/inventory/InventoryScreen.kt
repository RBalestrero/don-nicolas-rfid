package com.donnicolas.rfid.ui.inventory

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.api.ActivoUbicacionStockDto
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.InventarioListItemDto
import com.donnicolas.rfid.inventory.ArticleCount
import com.donnicolas.rfid.inventory.ArticleStatus
import com.donnicolas.rfid.inventory.InventoryArticleAggregator
import com.donnicolas.rfid.inventory.InventoryReport
import com.donnicolas.rfid.inventory.ReportFilter
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.BannerTone
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.ConfirmDialog
import com.donnicolas.rfid.ui.components.DangerAction
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.FilterChip
import com.donnicolas.rfid.ui.components.InventorySessionSheet
import com.donnicolas.rfid.ui.components.ListRow
import com.donnicolas.rfid.ui.components.MessageBanner
import com.donnicolas.rfid.ui.components.MetricRow
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.SecondaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.theme.WmsExcess
import com.donnicolas.rfid.ui.theme.WmsOk
import com.donnicolas.rfid.ui.theme.WmsWarn

private val OpenBadgeYellow = Color(0xFFCA8A04)

private enum class PendingConfirm {
    NONE,
    FINISH,
    CANCEL,
    CANCEL_SELECTED,
    CLEAR_READS,
}

@Composable
fun InventoryScreen(
    state: InventoryUiState,
    onSelectScope: (InventoryScope) -> Unit,
    onArticuloQueryChange: (String) -> Unit,
    onSelectArticulo: (ActivoDto) -> Unit,
    onSelectUbicacionStock: (ActivoUbicacionStockDto) -> Unit,
    onSelectDeposito: (DepositoDto) -> Unit,
    onRefreshDepositos: () -> Unit,
    onStartNew: () -> Unit,
    onResume: (InventarioListItemDto) -> Unit,
    onEnterOpenSelection: (String?) -> Unit,
    onExitOpenSelection: () -> Unit,
    onToggleOpenSelected: (String) -> Unit,
    onSelectAllOpen: () -> Unit,
    onClearOpenSelection: () -> Unit,
    onCancelOpenSelected: () -> Unit,
    onStartScan: () -> Unit,
    onStopScan: () -> Unit,
    onClearReads: () -> Unit,
    onSync: () -> Unit,
    onClose: () -> Unit,
    onCancel: () -> Unit,
    onLeaveWithoutClosing: () -> Unit,
    onBackToSelect: () -> Unit,
    onNavigateBackFromSelect: () -> Unit,
    onFinishResult: () -> Unit,
    onOpenHistory: () -> Unit,
    onRefreshHistory: () -> Unit,
    onBackHome: () -> Unit,
    onReconnect: () -> Unit,
    onReportFilter: (ReportFilter) -> Unit = {},
) {
    var showSessionSheet by remember { mutableStateOf(false) }
    var pendingConfirm by remember { mutableStateOf(PendingConfirm.NONE) }
    val selectedCount = state.selectedOpenIds.size
    val selectionMode = state.openSelectionMode

    val stepTitle = when (state.step) {
        InventoryStep.CHOICE_SCOPE -> "Inventario"
        InventoryStep.SELECT_ARTICULO -> "Artículo"
        InventoryStep.SELECT_UBICACION -> "Ubicación"
        InventoryStep.SELECT_DEPOSITO -> "Depósito"
        InventoryStep.CHOICE_SESSION -> "En curso"
        InventoryStep.SCANNING -> if (state.articuloUbicacionMode) {
            state.selectedActivo?.numeroPatrimonial ?: "Conteo"
        } else {
            "Conteo"
        }
        InventoryStep.RESULT -> "Resumen"
        InventoryStep.HISTORY -> "Historial"
    }
    val onBack = when (state.step) {
        InventoryStep.CHOICE_SCOPE -> onBackHome
        InventoryStep.SELECT_ARTICULO,
        InventoryStep.SELECT_UBICACION,
        InventoryStep.SELECT_DEPOSITO,
        -> onNavigateBackFromSelect
        InventoryStep.CHOICE_SESSION -> {
            if (selectionMode) onExitOpenSelection else onNavigateBackFromSelect
        }
        InventoryStep.SCANNING -> {
            { showSessionSheet = true }
        }
        InventoryStep.RESULT -> onFinishResult
        InventoryStep.HISTORY -> onBackToSelect
    }

    val menuItems = when (state.step) {
        InventoryStep.CHOICE_SCOPE,
        InventoryStep.SELECT_ARTICULO,
        InventoryStep.SELECT_UBICACION,
        -> emptyList()
        InventoryStep.SELECT_DEPOSITO -> listOf(
            OverflowMenuItem("Actualizar depósitos", enabled = !state.loading, onClick = onRefreshDepositos),
        )
        InventoryStep.CHOICE_SESSION -> if (selectionMode) {
            listOf(
                OverflowMenuItem("Seleccionar todos", onClick = onSelectAllOpen),
                OverflowMenuItem("Limpiar selección", onClick = onClearOpenSelection),
                OverflowMenuItem("Salir de selección", onClick = onExitOpenSelection),
            )
        } else {
            listOf(
                OverflowMenuItem("Seleccionar", onClick = { onEnterOpenSelection(null) }),
            )
        }
        InventoryStep.SCANNING -> listOf(
            OverflowMenuItem(
                "Borrar lecturas",
                enabled = !state.loading && state.uniqueReads > 0,
                destructive = true,
                onClick = { pendingConfirm = PendingConfirm.CLEAR_READS },
            ),
        ) + if (!state.articuloUbicacionMode) {
            listOf(
                OverflowMenuItem("Sincronizar", enabled = !state.loading && !state.offlineMode, onClick = onSync),
                OverflowMenuItem("Reconectar lector", onClick = onReconnect),
            )
        } else {
            listOf(OverflowMenuItem("Reconectar lector", onClick = onReconnect))
        }
        InventoryStep.RESULT -> listOf(
            OverflowMenuItem(
                "Inicio",
                onClick = {
                    onFinishResult()
                    onBackHome()
                },
            ),
        )
        InventoryStep.HISTORY -> listOf(
            OverflowMenuItem("Actualizar", enabled = !state.loading, onClick = onRefreshHistory),
        )
    }

    BackHandler(onBack = onBack)

    if (showSessionSheet && state.step == InventoryStep.SCANNING) {
        InventorySessionSheet(
            onDismiss = { showSessionSheet = false },
            onMinimize = onLeaveWithoutClosing,
            onCancel = { pendingConfirm = PendingConfirm.CANCEL },
            cancelEnabled = !state.loading && !state.scanning,
        )
    }

    when (pendingConfirm) {
        PendingConfirm.FINISH -> ConfirmDialog(
            title = "Finalizar inventario",
            message = if (state.articuloUbicacionMode) {
                "Se envía a auditoría. El stock se ajusta al confirmar en la web."
            } else {
                "Se cierra el conteo. El stock se ajusta al auditar en la web."
            },
            confirmLabel = "Finalizar",
            onConfirm = {
                pendingConfirm = PendingConfirm.NONE
                onClose()
            },
            onDismiss = { pendingConfirm = PendingConfirm.NONE },
        )
        PendingConfirm.CANCEL -> ConfirmDialog(
            title = "Cancelar inventario",
            message = "Se descarta este conteo. No se puede retomar.",
            confirmLabel = "Cancelar conteo",
            destructive = true,
            onConfirm = {
                pendingConfirm = PendingConfirm.NONE
                onCancel()
            },
            onDismiss = { pendingConfirm = PendingConfirm.NONE },
        )
        PendingConfirm.CANCEL_SELECTED -> ConfirmDialog(
            title = "Cancelar seleccionados",
            message = "Se cancelan $selectedCount inventario(s). No se pueden retomar.",
            confirmLabel = "Cancelar $selectedCount",
            destructive = true,
            onConfirm = {
                pendingConfirm = PendingConfirm.NONE
                onCancelOpenSelected()
            },
            onDismiss = { pendingConfirm = PendingConfirm.NONE },
        )
        PendingConfirm.CLEAR_READS -> ConfirmDialog(
            title = "Borrar lecturas",
            message = "Se descartan las etiquetas leídas. El inventario sigue abierto.",
            confirmLabel = "Borrar",
            destructive = true,
            onConfirm = {
                pendingConfirm = PendingConfirm.NONE
                onClearReads()
            },
            onDismiss = { pendingConfirm = PendingConfirm.NONE },
        )
        PendingConfirm.NONE -> Unit
    }

    AppScaffold(
        title = stepTitle,
        onBack = onBack,
        subtitle = when {
            state.articuloUbicacionMode && state.step == InventoryStep.SCANNING ->
                state.selectedUbicacionStock?.let {
                    "${it.depositoNombre} · ${it.ubicacionCodigo}"
                }
            state.selectedActivo != null && state.step != InventoryStep.CHOICE_SCOPE ->
                state.selectedActivo.numeroPatrimonial
            else -> state.selectedDeposito?.nombre
        },
        trailing = {
            when {
                state.offlineMode -> StatusChip("Off", ChipTone.Warn)
                state.scanning -> StatusChip("Leyendo", ChipTone.Accent)
                state.step == InventoryStep.SCANNING -> StatusChip("En curso", ChipTone.Ok)
                selectionMode && selectedCount > 0 -> StatusChip("$selectedCount sel.", ChipTone.Warn)
            }
        },
        menuItems = menuItems,
        bottomBar = when (state.step) {
            InventoryStep.SCANNING -> {
                {
                    if (state.scanning) {
                        PrimaryAction(
                            text = "Parar",
                            onClick = onStopScan,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            PrimaryAction(
                                text = "Leer",
                                onClick = onStartScan,
                                enabled = !state.loading,
                                modifier = Modifier.weight(1f),
                            )
                            SecondaryAction(
                                text = if (state.articuloUbicacionMode) "Listo" else "Listo",
                                onClick = { pendingConfirm = PendingConfirm.FINISH },
                                enabled = !state.loading,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
            InventoryStep.CHOICE_SESSION -> {
                {
                    if (selectionMode && selectedCount > 0) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            DangerAction(
                                text = "Cancelar ($selectedCount)",
                                onClick = { pendingConfirm = PendingConfirm.CANCEL_SELECTED },
                                enabled = !state.loading,
                                modifier = Modifier.weight(1f),
                            )
                            SecondaryAction(
                                text = "Nuevo",
                                onClick = onStartNew,
                                enabled = !state.loading,
                            )
                        }
                    } else {
                        PrimaryAction(
                            text = "Inventario nuevo",
                            onClick = onStartNew,
                            enabled = !state.loading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
            InventoryStep.RESULT -> {
                {
                    PrimaryAction(
                        text = "Listo",
                        onClick = onFinishResult,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            InventoryStep.CHOICE_SCOPE -> {
                {
                    SecondaryAction(
                        text = "Ver historial",
                        onClick = onOpenHistory,
                        enabled = !state.loading,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            InventoryStep.SELECT_DEPOSITO -> {
                if (state.scope != InventoryScope.ARTICULO) {
                    {
                        SecondaryAction(
                            text = "Ver historial",
                            onClick = onOpenHistory,
                            enabled = !state.loading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else {
                    null
                }
            }
            else -> null
        },
    ) {
        state.statusMessage?.takeIf { state.step != InventoryStep.SCANNING || !state.articuloUbicacionMode }?.let { msg ->
            MessageBanner(
                message = msg,
                tone = if (msg.contains("error", ignoreCase = true) ||
                    msg.contains("No se pudo", ignoreCase = true)
                ) {
                    BannerTone.Warn
                } else {
                    BannerTone.Info
                },
            )
            Spacer(modifier = Modifier.height(6.dp))
        }

        state.error?.let {
            ErrorBanner(it)
            Spacer(modifier = Modifier.height(6.dp))
        }

        if (state.loading && state.step != InventoryStep.SCANNING) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            Spacer(modifier = Modifier.height(6.dp))
        }

        AnimatedContent(
            targetState = state.step,
            transitionSpec = {
                (fadeIn() + slideInHorizontally { it / 8 }) togetherWith
                    (fadeOut() + slideOutHorizontally { -it / 8 })
            },
            label = "inventoryStep",
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) { step ->
            when (step) {
                InventoryStep.CHOICE_SCOPE -> ChoiceScopeStep(onSelect = onSelectScope)
                InventoryStep.SELECT_ARTICULO -> SelectArticuloStep(
                    query = state.articuloQuery,
                    results = state.articuloResults,
                    searching = state.searchingArticulos,
                    loading = state.loading,
                    onQueryChange = onArticuloQueryChange,
                    onSelect = onSelectArticulo,
                )
                InventoryStep.SELECT_UBICACION -> SelectUbicacionStockStep(
                    slots = state.ubicacionesStock,
                    loading = state.loading,
                    onSelect = onSelectUbicacionStock,
                )
                InventoryStep.SELECT_DEPOSITO -> SelectDepositoStep(
                    depositos = state.depositos,
                    openCountByDeposito = state.openCountByDeposito,
                    loading = state.loading,
                    onSelect = onSelectDeposito,
                )
                InventoryStep.CHOICE_SESSION -> ChoiceSessionStep(
                    sessions = state.openSessions,
                    selectionMode = selectionMode,
                    selectedIds = state.selectedOpenIds,
                    onEnterSelection = onEnterOpenSelection,
                    onToggle = onToggleOpenSelected,
                    onSelectAll = onSelectAllOpen,
                    onClearSelection = onClearOpenSelection,
                    onResume = onResume,
                )
                InventoryStep.SCANNING -> ScanningStep(state = state)
                InventoryStep.RESULT -> ResultStep(
                    state = state,
                    onFilter = onReportFilter,
                )
                InventoryStep.HISTORY -> HistoryStep(
                    sessions = state.historySessions,
                    depositos = state.depositos,
                    loading = state.loading,
                )
            }
        }
    }
}

@Composable
private fun ChoiceScopeStep(onSelect: (InventoryScope) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "¿Qué querés inventariar?",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ListRow(
            title = "Depósito completo",
            subtitle = "Cuenta todos los artículos del depósito",
            onClick = { onSelect(InventoryScope.DEPOSITO) },
        )
        ListRow(
            title = "Un artículo",
            subtitle = "Inventariá un SKU en una ubicación",
            onClick = { onSelect(InventoryScope.ARTICULO) },
        )
    }
}

@Composable
private fun SelectUbicacionStockStep(
    slots: List<ActivoUbicacionStockDto>,
    loading: Boolean,
    onSelect: (ActivoUbicacionStockDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Elegí la ubicación a inventariar",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(6.dp))
        if (slots.isEmpty() && !loading) {
            Text(
                text = "Sin ubicaciones con stock.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(slots, key = { it.ubicacionId }) { slot ->
                ListRow(
                    title = slot.ubicacionCodigo,
                    subtitle = "${slot.depositoNombre} · ${slot.sectorNombre} · ${slot.cantidad} u.",
                    trailing = slot.cantidad.toString(),
                    onClick = { onSelect(slot) },
                )
            }
        }
    }
}

@Composable
private fun SelectArticuloStep(
    query: String,
    results: List<ActivoDto>,
    searching: Boolean,
    loading: Boolean,
    onQueryChange: (String) -> Unit,
    onSelect: (ActivoDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Buscá por SKU o descripción",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(6.dp))
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Artículo") },
            placeholder = { Text("Ej. SKU-001") },
        )
        Spacer(modifier = Modifier.height(6.dp))
        when {
            searching -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            }
            query.trim().length < 2 -> {
                Text(
                    text = "Escribí al menos 2 caracteres.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            results.isEmpty() && !loading -> {
                Text(
                    text = "Sin resultados.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(results, key = { it.id }) { activo ->
                        ListRow(
                            title = activo.numeroPatrimonial,
                            subtitle = activo.descripcion,
                            onClick = { onSelect(activo) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SelectDepositoStep(
    depositos: List<DepositoDto>,
    openCountByDeposito: Map<String, Int>,
    loading: Boolean,
    onSelect: (DepositoDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Elegí el depósito a contar",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(6.dp))
        if (depositos.isEmpty() && !loading) {
            Text(
                text = "No hay depósitos activos.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(depositos, key = { it.id }) { deposito ->
                val openCount = openCountByDeposito[deposito.id] ?: 0
                ListRow(
                    title = deposito.nombre,
                    subtitle = when {
                        openCount == 1 -> "1 inventario en curso"
                        openCount > 1 -> "$openCount inventarios en curso"
                        else -> deposito.direccion?.takeIf { it.isNotBlank() } ?: "Tocá para continuar"
                    },
                    trailing = if (openCount > 0) openCount.toString() else null,
                    trailingColor = if (openCount > 0) OpenBadgeYellow else null,
                    onClick = { onSelect(deposito) },
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChoiceSessionStep(
    sessions: List<InventarioListItemDto>,
    selectionMode: Boolean,
    selectedIds: Set<String>,
    onEnterSelection: (String?) -> Unit,
    onToggle: (String) -> Unit,
    onSelectAll: () -> Unit,
    onClearSelection: () -> Unit,
    onResume: (InventarioListItemDto) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = if (selectionMode) {
                "Marcá inventarios para cancelar"
            } else {
                "Tocá para retomar · mantené para seleccionar"
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (selectionMode && sessions.isNotEmpty()) {
            val allSelected = selectedIds.size == sessions.size && sessions.isNotEmpty()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(6.dp))
                    .clickable {
                        if (allSelected) onClearSelection() else onSelectAll()
                    }
                    .padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = allSelected,
                    onCheckedChange = { checked ->
                        if (checked) onSelectAll() else onClearSelection()
                    },
                    colors = CheckboxDefaults.colors(
                        checkedColor = MaterialTheme.colorScheme.error,
                    ),
                )
                Text(
                    text = if (allSelected) "Deseleccionar todos" else "Seleccionar todos",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
        }

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(sessions, key = { it.id }) { session ->
                val selected = session.id in selectedIds
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (selected) Color(0xFFFFF7ED) else MaterialTheme.colorScheme.surface,
                            RoundedCornerShape(6.dp),
                        )
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(6.dp))
                        .combinedClickable(
                            onClick = {
                                if (selectionMode) {
                                    onToggle(session.id)
                                } else {
                                    onResume(session)
                                }
                            },
                            onLongClick = {
                                onEnterSelection(session.id)
                            },
                        )
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (selectionMode) {
                        Checkbox(
                            checked = selected,
                            onCheckedChange = { onToggle(session.id) },
                            colors = CheckboxDefaults.colors(
                                checkedColor = MaterialTheme.colorScheme.error,
                            ),
                        )
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(vertical = 8.dp, horizontal = 8.dp),
                    ) {
                        Text(
                            text = "${session.totalEncontrado} / ${session.totalEsperado} leídos",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Iniciado ${formatIniciado(session.iniciadoEn)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (!selectionMode) {
                            Text(
                                text = "Retomar →",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryStep(
    sessions: List<InventarioListItemDto>,
    depositos: List<DepositoDto>,
    loading: Boolean,
) {
    val nombreById = remember(depositos) { depositos.associate { it.id to it.nombre } }
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Inventarios cerrados recientemente",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))
        if (sessions.isEmpty() && !loading) {
            Text(
                text = "Todavía no hay inventarios finalizados.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(sessions, key = { it.id }) { session ->
                val kpis = sessionKpis(session)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(6.dp))
                        .padding(10.dp),
                ) {
                    Text(
                        text = nombreById[session.depositoId] ?: "Depósito",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Cerrado ${formatIniciado(session.cerradoEn ?: session.iniciadoEn)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = when {
                            session.auditado -> "Auditado en la web"
                            session.tieneDiscrepancias -> "Pendiente de auditar · con diferencias"
                            else -> "Pendiente de auditar"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = when {
                            session.auditado -> WmsOk
                            session.tieneDiscrepancias -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    MetricRow(
                        items = listOf(
                            "Antes" to kpis.stockAntes.toString(),
                            "Leídos" to kpis.leidos.toString(),
                            "Desp." to kpis.stockDespues.toString(),
                            "Dif." to formatDiff(kpis.diferencia),
                        ),
                    )
                }
            }
        }
    }
}

private fun formatIniciado(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    val cleaned = iso.replace("Z", "").substringBefore('.')
    val parts = cleaned.split('T')
    if (parts.size < 2) return cleaned.take(16)
    val date = parts[0].split('-')
    val time = parts[1].take(5)
    return if (date.size == 3) "${date[2]}/${date[1]} $time" else cleaned.take(16)
}

private data class SessionKpis(
    val stockAntes: Int,
    val leidos: Int,
    val stockDespues: Int,
    val diferencia: Int,
)

private fun sessionKpis(item: InventarioListItemDto): SessionKpis {
    val stockAntes = item.totalEsperado
    // Solo lecturas del depósito (encontrados). Los sobrantes se avisan aparte.
    val leidos = item.totalEncontrado
    val stockDespues = item.totalEncontrado
    return SessionKpis(stockAntes, leidos, stockDespues, stockDespues - stockAntes)
}

private fun reportKpis(report: InventoryReport): SessionKpis {
    val stockAntes = report.esperado
    val leidos = report.encontrado
    val stockDespues = report.encontrado
    return SessionKpis(stockAntes, leidos, stockDespues, stockDespues - stockAntes)
}

private fun formatDiff(n: Int): String = if (n > 0) "+$n" else "$n"

@Composable
private fun ScanningStep(state: InventoryUiState) {
    if (state.articuloUbicacionMode) {
        val leidos = state.uniqueReads
        val stock = state.compare?.esperado
            ?: state.inventario?.totalEsperado
            ?: state.selectedUbicacionStock?.cantidad
            ?: 0
        val tone = when {
            leidos < stock -> MaterialTheme.colorScheme.error
            leidos > stock -> WmsExcess
            else -> WmsOk
        }
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "$leidos/$stock",
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold,
                color = tone,
            )
        }
        return
    }
    Column(modifier = Modifier.fillMaxSize()) {
        val compare = state.compare
            if (compare != null) {
            MetricRow(
                items = listOf(
                    "Stock" to compare.esperado.toString(),
                    "Leído" to compare.encontrado.toString(),
                    "Faltan" to compare.faltante.toString(),
                ),
            )
            if (state.sinEpcExpected > 0) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${state.sinEpcExpected} sin etiqueta RFID: el cierre las marca faltantes",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "${state.articleCounts.size} artículos · ${state.uniqueReads} etiquetas",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        LazyColumn(modifier = Modifier.weight(1f)) {
            items(state.articleCounts, key = { it.key }) { row ->
                ArticleCountRow(row)
            }
        }
    }
}

@Composable
private fun ResultStep(
    state: InventoryUiState,
    onFilter: (ReportFilter) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        val report = state.report
        if (report != null) {
            val kpis = reportKpis(report)
            Text(
                text = when {
                    report.faltante > 0 -> "Inventario cerrado con faltantes"
                    else -> "Inventario cerrado sin diferencias"
                },
                style = MaterialTheme.typography.titleSmall,
                color = when {
                    report.faltante > 0 -> MaterialTheme.colorScheme.error
                    else -> WmsOk
                },
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Coincidencia ${"%.0f".format(report.coincidenciaPct)}%",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            MetricRow(
                items = listOf(
                    "Antes" to kpis.stockAntes.toString(),
                    "Leídos" to kpis.leidos.toString(),
                    "Desp." to kpis.stockDespues.toString(),
                    "Dif." to formatDiff(kpis.diferencia),
                ),
            )
            if (report.faltante > 0) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${report.faltante} faltante${if (report.faltante == 1) "" else "s"}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Detalle por artículo",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                FilterChip(
                    text = "Faltan",
                    selected = state.reportFilter == ReportFilter.FALTANTES,
                    onClick = { onFilter(ReportFilter.FALTANTES) },
                    modifier = Modifier.weight(1f),
                )
                FilterChip(
                    text = "OK",
                    selected = state.reportFilter == ReportFilter.ENCONTRADOS,
                    onClick = { onFilter(ReportFilter.ENCONTRADOS) },
                    modifier = Modifier.weight(1f),
                )
                FilterChip(
                    text = "Todos",
                    selected = state.reportFilter == ReportFilter.TODOS,
                    onClick = { onFilter(ReportFilter.TODOS) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        val articles = InventoryArticleAggregator.filter(state.articleCounts, state.reportFilter)
        Text(
            text = "${articles.size} artículo${if (articles.size == 1) "" else "s"}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(2.dp))
        LazyColumn(modifier = Modifier.weight(1f)) {
            items(articles, key = { it.key }) { row ->
                ArticleCountRow(row)
            }
        }
    }
}

@Composable
private fun ArticleCountRow(row: ArticleCount) {
    val countColor = when (row.status) {
        ArticleStatus.OK -> WmsOk
        ArticleStatus.PARCIAL -> WmsWarn
        ArticleStatus.FALTA -> MaterialTheme.colorScheme.error
        ArticleStatus.EXCESO -> WmsExcess
        ArticleStatus.SOBRA -> WmsExcess
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = row.descripcion?.takeIf { it.isNotBlank() } ?: row.articulo,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(end = 12.dp),
        )
        Text(
            text = row.cantidadLabel,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = countColor,
        )
    }
}
