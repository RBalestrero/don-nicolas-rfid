package com.donnicolas.rfid.ui.inventory

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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.InventarioListItemDto
import com.donnicolas.rfid.inventory.ArticleCount
import com.donnicolas.rfid.inventory.ArticleStatus
import com.donnicolas.rfid.inventory.InventoryArticleAggregator
import com.donnicolas.rfid.inventory.InventoryReport
import com.donnicolas.rfid.inventory.ReportFilter
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.ConfirmDialog
import com.donnicolas.rfid.ui.components.DangerAction
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.InventorySessionSheet
import com.donnicolas.rfid.ui.components.ListRow
import com.donnicolas.rfid.ui.components.MetricRow
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.SecondaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.theme.WmsOk
import com.donnicolas.rfid.ui.theme.WmsWarn
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.ui.graphics.Color

private val OpenBadgeYellow = Color(0xFFCA8A04)

private enum class PendingConfirm {
    NONE,
    FINISH,
    CANCEL,
    CANCEL_SELECTED,
}

@Composable
fun InventoryScreen(
    state: InventoryUiState,
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
    onSync: () -> Unit,
    onClose: () -> Unit,
    onCancel: () -> Unit,
    onLeaveWithoutClosing: () -> Unit,
    onBackToSelect: () -> Unit,
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
        InventoryStep.SELECT_DEPOSITO -> "Inventario"
        InventoryStep.CHOICE_SESSION -> "En curso"
        InventoryStep.SCANNING -> "Conteo"
        InventoryStep.RESULT -> "Resumen"
        InventoryStep.HISTORY -> "Historial"
    }
    val onBack = when (state.step) {
        InventoryStep.SELECT_DEPOSITO -> onBackHome
        InventoryStep.CHOICE_SESSION -> {
            if (selectionMode) onExitOpenSelection else onBackToSelect
        }
        InventoryStep.SCANNING -> {
            { showSessionSheet = true }
        }
        InventoryStep.RESULT -> onFinishResult
        InventoryStep.HISTORY -> onBackToSelect
    }

    val menuItems = when (state.step) {
        InventoryStep.SELECT_DEPOSITO -> listOf(
            OverflowMenuItem("Historial", enabled = !state.loading, onClick = onOpenHistory),
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
            OverflowMenuItem("Sincronizar", enabled = !state.loading && !state.offlineMode, onClick = onSync),
            OverflowMenuItem("Reconectar lector", onClick = onReconnect),
        )
        InventoryStep.RESULT -> listOf(
            OverflowMenuItem("Inicio", onClick = onBackHome),
        )
        InventoryStep.HISTORY -> listOf(
            OverflowMenuItem("Actualizar", enabled = !state.loading, onClick = onRefreshHistory),
        )
    }

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
            message = "Se cerrará el conteo, se ajustará el stock y verás el resumen. ¿Continuar?",
            confirmLabel = "Finalizar",
            onConfirm = {
                pendingConfirm = PendingConfirm.NONE
                onClose()
            },
            onDismiss = { pendingConfirm = PendingConfirm.NONE },
        )
        PendingConfirm.CANCEL -> ConfirmDialog(
            title = "Cancelar inventario",
            message = "Se descarta este conteo. No quedará disponible para retomar.",
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
            message = "Se cancelarán $selectedCount inventario(s) en curso. No se podrán retomar.",
            confirmLabel = "Cancelar $selectedCount",
            destructive = true,
            onConfirm = {
                pendingConfirm = PendingConfirm.NONE
                onCancelOpenSelected()
            },
            onDismiss = { pendingConfirm = PendingConfirm.NONE },
        )
        PendingConfirm.NONE -> Unit
    }

    AppScaffold(
        title = stepTitle,
        onBack = onBack,
        subtitle = state.selectedDeposito?.nombre,
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
                            text = "Detener lectura",
                            onClick = onStopScan,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            PrimaryAction(
                                text = "Leer RFID",
                                onClick = onStartScan,
                                enabled = !state.loading,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            PrimaryAction(
                                text = "Listo",
                                onClick = { pendingConfirm = PendingConfirm.FINISH },
                                enabled = !state.loading,
                                modifier = Modifier.fillMaxWidth(),
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
            InventoryStep.SELECT_DEPOSITO -> {
                {
                    SecondaryAction(
                        text = "Ver historial",
                        onClick = onOpenHistory,
                        enabled = !state.loading,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            else -> null
        },
    ) {
        state.statusMessage?.let { msg ->
            Text(
                text = msg,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(4.dp))
        }

        state.error?.let {
            ErrorBanner(it)
            Spacer(modifier = Modifier.height(6.dp))
        }

        if (state.loading && state.step != InventoryStep.SCANNING) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            Spacer(modifier = Modifier.height(6.dp))
        }

        when (state.step) {
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

@Composable
private fun SelectDepositoStep(
    depositos: List<DepositoDto>,
    openCountByDeposito: Map<String, Int>,
    loading: Boolean,
    onSelect: (DepositoDto) -> Unit,
) {
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
        modifier = Modifier.fillMaxSize(),
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
        modifier = Modifier.fillMaxSize(),
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
                        text = "Iniciado ${formatIniciado(session.iniciadoEn)}" +
                            if (session.totalSobrante > 0) " · +${session.totalSobrante} sobra" else "",
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

@Composable
private fun HistoryStep(
    sessions: List<InventarioListItemDto>,
    depositos: List<DepositoDto>,
    loading: Boolean,
) {
    val nombreById = remember(depositos) { depositos.associate { it.id to it.nombre } }
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
        modifier = Modifier.fillMaxSize(),
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
                if (session.totalExceso > 0 || session.totalAjeno > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = listOfNotNull(
                            "${session.totalExceso} de más del depósito"
                                .takeIf { session.totalExceso > 0 },
                            "${session.totalAjeno} ajena${if (session.totalAjeno == 1) "" else "s"}"
                                .takeIf { session.totalAjeno > 0 },
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (session.totalExceso > 0) {
                            MaterialTheme.colorScheme.error
                        } else {
                            WmsWarn
                        },
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
    val compare = state.compare
    if (compare != null) {
        MetricRow(
            items = listOf(
                "Stock" to compare.esperado.toString(),
                "Leído" to compare.encontrado.toString(),
                "Faltan" to compare.faltante.toString(),
            ),
        )
        if (compare.sobrante > 0) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "+${compare.sobrante} sobrante${if (compare.sobrante == 1) "" else "s"}",
                style = MaterialTheme.typography.labelSmall,
                color = WmsWarn,
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
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(state.articleCounts, key = { it.key }) { row ->
            ArticleCountRow(row)
        }
    }
}

@Composable
private fun ResultStep(
    state: InventoryUiState,
    onFilter: (ReportFilter) -> Unit,
) {
    val report = state.report
    if (report != null) {
        val kpis = reportKpis(report)
        Text(
            text = when {
                report.faltante > 0 -> "Inventario cerrado con faltantes"
                report.exceso > 0 -> "Inventario cerrado con excesos"
                report.ajeno > 0 -> "Inventario cerrado · etiquetas ajenas"
                else -> "Inventario cerrado sin diferencias"
            },
            style = MaterialTheme.typography.titleSmall,
            color = when {
                report.faltante > 0 -> MaterialTheme.colorScheme.error
                report.exceso > 0 -> MaterialTheme.colorScheme.error
                report.ajeno > 0 -> WmsWarn
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
        if (report.faltante > 0 || report.sobrante > 0) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = listOfNotNull(
                    "${report.faltante} faltante${if (report.faltante == 1) "" else "s"}"
                        .takeIf { report.faltante > 0 },
                    ("${report.exceso} de más del depósito " +
                        "(no incorporad${if (report.exceso == 1) "a" else "as"})")
                        .takeIf { report.exceso > 0 },
                    ("${report.ajeno} etiqueta${if (report.ajeno == 1) "" else "s"} " +
                        "ajena${if (report.ajeno == 1) "" else "s"} al depósito")
                        .takeIf { report.ajeno > 0 },
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall,
                color = if (report.faltante > 0 || report.exceso > 0) {
                    MaterialTheme.colorScheme.error
                } else {
                    WmsWarn
                },
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
            FilterChipBtn("Falt", ReportFilter.FALTANTES, state.reportFilter, onFilter, Modifier.weight(1f))
            FilterChipBtn("Sobr", ReportFilter.SOBRANTES, state.reportFilter, onFilter, Modifier.weight(1f))
            FilterChipBtn("OK", ReportFilter.ENCONTRADOS, state.reportFilter, onFilter, Modifier.weight(1f))
            FilterChipBtn("Todos", ReportFilter.TODOS, state.reportFilter, onFilter, Modifier.weight(1f))
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
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(articles, key = { it.key }) { row ->
            ArticleCountRow(row)
        }
    }
}

@Composable
private fun FilterChipBtn(
    label: String,
    filter: ReportFilter,
    selected: ReportFilter,
    onFilter: (ReportFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (selected == filter) {
        PrimaryAction(text = label, onClick = { onFilter(filter) }, modifier = modifier)
    } else {
        SecondaryAction(text = label, onClick = { onFilter(filter) }, modifier = modifier)
    }
}

@Composable
private fun ArticleCountRow(row: ArticleCount) {
    val statusLabel = when (row.status) {
        ArticleStatus.OK -> "OK"
        ArticleStatus.PARCIAL -> "PARCIAL"
        ArticleStatus.FALTA -> "FALTA"
        ArticleStatus.SOBRA -> "SOBRA"
    }
    val statusColor = when (row.status) {
        ArticleStatus.OK -> WmsOk
        ArticleStatus.PARCIAL, ArticleStatus.SOBRA -> WmsWarn
        ArticleStatus.FALTA -> MaterialTheme.colorScheme.error
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = row.articulo,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = buildString {
                    append(statusLabel)
                    row.descripcion?.takeIf { it.isNotBlank() }?.let {
                        append(" · ")
                        append(it)
                    }
                },
                style = MaterialTheme.typography.labelSmall,
                color = statusColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = row.cantidadLabel,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
    }
}
