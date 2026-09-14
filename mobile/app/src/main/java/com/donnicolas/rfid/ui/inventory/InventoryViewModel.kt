package com.donnicolas.rfid.ui.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioListItemDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.InventarioStartResult
import com.donnicolas.rfid.data.repository.InventoryRepository
import com.donnicolas.rfid.data.repository.InventoryResult
import com.donnicolas.rfid.inventory.ArticleCount
import com.donnicolas.rfid.inventory.InventoryArticleAggregator
import com.donnicolas.rfid.inventory.InventoryComparer
import com.donnicolas.rfid.inventory.InventoryCompareResult
import com.donnicolas.rfid.inventory.InventoryReport
import com.donnicolas.rfid.inventory.ReportFilter
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
import com.donnicolas.rfid.rfid.RfidInventorySession
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTriggerMode
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class InventoryStep {
    SELECT_DEPOSITO,
    CHOICE_SESSION,
    SCANNING,
    RESULT,
    HISTORY,
}

data class InventoryUiState(
    val step: InventoryStep = InventoryStep.SELECT_DEPOSITO,
    val loading: Boolean = false,
    val depositos: List<DepositoDto> = emptyList(),
    /** Cantidad de inventarios en_curso por deposito_id. */
    val openCountByDeposito: Map<String, Int> = emptyMap(),
    val selectedDeposito: DepositoDto? = null,
    val openSessions: List<InventarioListItemDto> = emptyList(),
    /** Historial de inventarios cerrados (operador). */
    val historySessions: List<InventarioListItemDto> = emptyList(),
    /** Modo selección en lista “en curso” (casillas visibles). */
    val openSelectionMode: Boolean = false,
    /** IDs seleccionados en la lista de inventarios en curso (para cancelar). */
    val selectedOpenIds: Set<String> = emptySet(),
    val inventario: InventarioDto? = null,
    val offlineMode: Boolean = false,
    val statusMessage: String? = null,
    val readerState: RfidReaderState = RfidReaderState.DISCONNECTED,
    val scanning: Boolean = false,
    val uniqueReads: Int = 0,
    val compare: InventoryCompareResult? = null,
    val articleCounts: List<ArticleCount> = emptyList(),
    val closedDetalles: List<DetalleInventarioDto> = emptyList(),
    val report: InventoryReport? = null,
    val reportFilter: ReportFilter = ReportFilter.FALTANTES,
    val error: AppError? = null,
)

class InventoryViewModel(
    private val repository: InventoryRepository,
    private val reader: RfidReader,
) : ViewModel() {
    private val session = RfidInventorySession()
    private val _state = MutableStateFlow(InventoryUiState())
    val state: StateFlow<InventoryUiState> = _state.asStateFlow()

    private var eventsJob: Job? = null
    private var expectedEpcs: Set<String> = emptySet()
    private var expectedDetalles: List<DetalleInventarioDto> = emptyList()

    init {
        observeReader()
        viewModelScope.launch {
            runCatching { reader.setTriggerMode(RfidTriggerMode.INVENTORY) }
        }
        loadDepositos()
        connectReader()
    }

    fun loadDepositos() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (val result = repository.listDepositos()) {
                is InventoryResult.Ok -> {
                    val activos = result.value.filter { d -> d.activo }
                    _state.update {
                        it.copy(loading = false, depositos = activos)
                    }
                    refreshOpenCounts()
                    activos.forEach { dep ->
                        repository.prefetchStock(dep.id)
                    }
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
        }
    }

    private suspend fun refreshOpenCounts() {
        when (val counts = repository.countOpenByDeposito()) {
            is InventoryResult.Ok -> _state.update {
                it.copy(openCountByDeposito = counts.value)
            }
            is InventoryResult.Error -> Unit // silencioso: badges opcionales
        }
    }

    /** Al elegir depósito: si hay abiertos, ofrece continuar o nuevo; si no, crea uno. */
    fun selectDeposito(deposito: DepositoDto) {
        viewModelScope.launch {
            _state.update {
                it.copy(
                    loading = true,
                    error = null,
                    selectedDeposito = deposito,
                    statusMessage = null,
                    openSessions = emptyList(),
                )
            }
            when (val open = repository.listOpenInventarios(deposito.id)) {
                is InventoryResult.Ok -> {
                    if (open.value.isNotEmpty()) {
                        _state.update {
                            it.copy(
                                loading = false,
                                step = InventoryStep.CHOICE_SESSION,
                                openSessions = open.value,
                                openSelectionMode = false,
                                selectedOpenIds = emptySet(),
                                statusMessage = "${open.value.size} inventario(s) en curso",
                            )
                        }
                    } else {
                        createNewInventario(deposito)
                    }
                }
                is InventoryResult.Error -> {
                    // Offline / error de lista: intentar crear (puede caer a offline local).
                    createNewInventario(deposito)
                }
            }
        }
    }

    fun startNewInventario() {
        val deposito = _state.value.selectedDeposito ?: return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, statusMessage = null) }
            createNewInventario(deposito)
        }
    }

    fun resumeInventario(item: InventarioListItemDto) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, statusMessage = null) }
            when (val result = repository.resumeInventario(item.id)) {
                is InventoryResult.Ok -> enterScanning(result.value, resume = true)
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
        }
    }

    fun enterOpenSelectionMode(initialId: String? = null) {
        _state.update { st ->
            val ids = when {
                initialId != null -> st.selectedOpenIds + initialId
                else -> st.selectedOpenIds
            }
            st.copy(openSelectionMode = true, selectedOpenIds = ids)
        }
    }

    fun exitOpenSelectionMode() {
        _state.update {
            it.copy(openSelectionMode = false, selectedOpenIds = emptySet())
        }
    }

    fun toggleOpenSessionSelected(id: String) {
        _state.update { st ->
            val next = if (id in st.selectedOpenIds) {
                st.selectedOpenIds - id
            } else {
                st.selectedOpenIds + id
            }
            st.copy(
                openSelectionMode = true,
                selectedOpenIds = next,
            )
        }
    }

    fun selectAllOpenSessions() {
        _state.update { st ->
            st.copy(
                openSelectionMode = true,
                selectedOpenIds = st.openSessions.map { it.id }.toSet(),
            )
        }
    }

    fun clearOpenSelection() {
        _state.update { it.copy(selectedOpenIds = emptySet()) }
    }

    /** Cancela uno o varios inventarios en curso desde la lista (sin retomarlos). */
    fun cancelarOpenSeleccionados() {
        val ids = _state.value.selectedOpenIds.toList()
        if (ids.isEmpty()) return
        val deposito = _state.value.selectedDeposito
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            var ok = 0
            var lastError: AppError? = null
            for (id in ids) {
                when (val result = repository.cancelar(id)) {
                    is InventoryResult.Ok -> ok += 1
                    is InventoryResult.Error -> lastError = result.error
                }
            }
            if (deposito == null) {
                _state.update {
                    it.copy(
                        loading = false,
                        openSelectionMode = false,
                        selectedOpenIds = emptySet(),
                        statusMessage = "Cancelados: $ok",
                        error = lastError,
                    )
                }
                refreshOpenCounts()
                return@launch
            }
            when (val open = repository.listOpenInventarios(deposito.id)) {
                is InventoryResult.Ok -> {
                    if (open.value.isEmpty()) {
                        _state.update {
                            it.copy(
                                loading = false,
                                step = InventoryStep.SELECT_DEPOSITO,
                                openSessions = emptyList(),
                                openSelectionMode = false,
                                selectedOpenIds = emptySet(),
                                selectedDeposito = null,
                                statusMessage = "Cancelados: $ok. Sin inventarios abiertos.",
                                error = lastError,
                            )
                        }
                    } else {
                        _state.update {
                            it.copy(
                                loading = false,
                                openSessions = open.value,
                                openSelectionMode = false,
                                selectedOpenIds = emptySet(),
                                statusMessage = "Cancelados: $ok · quedan ${open.value.size}",
                                error = lastError,
                            )
                        }
                    }
                    refreshOpenCounts()
                }
                is InventoryResult.Error -> {
                    _state.update {
                        it.copy(
                            loading = false,
                            openSelectionMode = false,
                            selectedOpenIds = emptySet(),
                            statusMessage = "Cancelados: $ok",
                            error = lastError ?: open.error,
                        )
                    }
                    refreshOpenCounts()
                }
            }
        }
    }

    fun startScan() {
        viewModelScope.launch {
            _state.update { it.copy(error = null) }
            try {
                if (_state.value.uniqueReads == 0) {
                    session.start()
                }
                // El lector es un singleton compartido con la pantalla de localización:
                // puede haber quedado en modo LOCATE, que rechaza startInventory().
                reader.setTriggerMode(RfidTriggerMode.INVENTORY)
                reader.startInventory()
                _state.update { it.copy(scanning = true) }
            } catch (e: RfidException) {
                _state.update { it.copy(scanning = false, error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        scanning = false,
                        error = AppError(
                            code = "INVENTORY_SCAN_START_FAILED",
                            title = "No se pudo iniciar la lectura",
                            detail = "startInventory() falló durante el inventario.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun stopScan() {
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            _state.update { it.copy(scanning = false) }
            refreshCompare()
        }
    }

    fun syncLecturas() {
        val invId = _state.value.inventario?.id ?: return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            val epcs = session.snapshot().tags.map { it.epc }
            when (val result = repository.syncLecturas(invId, epcs)) {
                is InventoryResult.Ok -> _state.update {
                    it.copy(
                        loading = false,
                        inventario = result.value,
                        statusMessage = "Lecturas sincronizadas",
                    )
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
            refreshCompare()
        }
    }

    fun cerrarInventario() {
        val inventario = _state.value.inventario ?: return
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            _state.update { it.copy(loading = true, error = null, scanning = false) }
            val epcs = session.snapshot().tags.map { it.epc }
            when (
                val result = repository.cerrar(
                    inventario = inventario,
                    deposito = _state.value.selectedDeposito,
                    expectedEpcs = expectedEpcs,
                    readEpcs = epcs,
                    offlineSession = _state.value.offlineMode,
                )
            ) {
                is InventoryResult.Ok -> {
                    val closed = result.value.inventario
                    val report = result.value.report
                    val defaultFilter = when {
                        report.faltantes.isNotEmpty() -> ReportFilter.FALTANTES
                        report.sobrantes.isNotEmpty() -> ReportFilter.SOBRANTES
                        else -> ReportFilter.ENCONTRADOS
                    }
                    _state.update {
                        it.copy(
                            loading = false,
                            step = InventoryStep.RESULT,
                            inventario = closed,
                            closedDetalles = closed.detalles,
                            report = report,
                            reportFilter = defaultFilter,
                            statusMessage = result.value.message,
                            compare = InventoryComparer.compare(expectedEpcs, epcs.toSet()),
                            articleCounts = InventoryArticleAggregator.fromDetalles(closed.detalles),
                        )
                    }
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
        }
    }

    fun setReportFilter(filter: ReportFilter) {
        _state.update { it.copy(reportFilter = filter) }
    }

    /** Cierra el resumen y vuelve a elegir depósito para otro inventario. */
    fun finishResult() {
        clearSessionState(message = "Listo. Podés iniciar otro inventario.")
    }

    fun openHistory() {
        viewModelScope.launch {
            _state.update {
                it.copy(
                    step = InventoryStep.HISTORY,
                    loading = true,
                    error = null,
                    historySessions = emptyList(),
                    statusMessage = null,
                )
            }
            when (val result = repository.listHistorial()) {
                is InventoryResult.Ok -> _state.update {
                    it.copy(loading = false, historySessions = result.value)
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
        }
    }

    fun refreshHistory() {
        if (_state.value.step != InventoryStep.HISTORY) return
        openHistory()
    }

    /**
     * Si la app pasa a segundo plano / se cierra durante un conteo, minimiza
     * (deja el inventario abierto en servidor) en lugar de cancelar.
     */
    fun onAppBackgrounded() {
        if (_state.value.step != InventoryStep.SCANNING) return
        if (_state.value.loading) return
        leaveWithoutClosing()
    }

    /**
     * Sale del conteo sin cerrar el inventario en el servidor.
     * Intenta sincronizar lecturas primero (si hay red y sesión online).
     */
    fun leaveWithoutClosing() {
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            val inv = _state.value.inventario
            val offline = _state.value.offlineMode
            if (inv != null && !offline && !inv.id.startsWith("offline-")) {
                val epcs = session.snapshot().tags.map { it.epc }
                if (epcs.isNotEmpty()) {
                    _state.update { it.copy(loading = true, scanning = false) }
                    when (val sync = repository.syncLecturas(inv.id, epcs)) {
                        is InventoryResult.Ok -> Unit
                        is InventoryResult.Error -> {
                            _state.update {
                                it.copy(
                                    loading = false,
                                    error = sync.error.copy(
                                        title = "Saliste sin sync completo",
                                        detail = sync.error.detail +
                                            " El inventario sigue abierto; podés retomarlo.",
                                    ),
                                )
                            }
                        }
                    }
                }
            }
            clearSessionState(
                keepError = _state.value.error,
                message = "Inventario minimizado. Podés retomarlo cuando quieras.",
            )
        }
    }

    /** Cancela el inventario en curso (no genera faltantes; no se puede retomar). */
    fun cancelarInventario() {
        val inventario = _state.value.inventario ?: return
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            _state.update { it.copy(loading = true, error = null, scanning = false) }
            when (val result = repository.cancelar(inventario.id)) {
                is InventoryResult.Ok -> {
                    clearSessionState(message = "Inventario cancelado.")
                }
                is InventoryResult.Error -> {
                    // Offline local: igual salimos
                    if (inventario.id.startsWith("offline-")) {
                        clearSessionState(message = "Inventario local descartado.")
                    } else {
                        _state.update { it.copy(loading = false, error = result.error) }
                    }
                }
            }
        }
    }

    fun backToSelect() {
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            clearSessionState()
        }
    }

    fun connectReader() {
        viewModelScope.launch {
            try {
                reader.connect()
            } catch (e: RfidException) {
                _state.update { it.copy(error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        error = AppError(
                            code = "RFID_CONNECT_FAILED",
                            title = "No se pudo conectar el lector RFID",
                            detail = "connect() falló al abrir inventario.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    override fun onCleared() {
        eventsJob?.cancel()
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
        }
        super.onCleared()
    }

    private suspend fun createNewInventario(deposito: DepositoDto) {
        when (val result = repository.startInventario(deposito)) {
            is InventoryResult.Ok -> enterScanning(result.value, resume = false)
            is InventoryResult.Error -> _state.update {
                it.copy(loading = false, error = result.error)
            }
        }
    }

    private fun enterScanning(start: InventarioStartResult, resume: Boolean) {
        val inv = start.inventario
        expectedDetalles = inv.detalles.filter {
            val e = it.estado.lowercase()
            e == "esperado" || e == "encontrado"
        }.ifEmpty { inv.detalles.filter { !it.epc.isNullOrBlank() } }

        expectedEpcs = expectedDetalles
            .mapNotNull { it.epc?.trim()?.uppercase() }
            .filter { it.isNotEmpty() }
            .toSet()

        val alreadyRead = inv.detalles
            .filter {
                val e = it.estado.lowercase()
                e == "encontrado" || e == "sobrante"
            }
            .mapNotNull { it.epc?.trim()?.uppercase() }
            .filter { it.isNotEmpty() }

        session.clear()
        if (resume && alreadyRead.isNotEmpty()) {
            session.seedKnownEpcs(alreadyRead)
        }

        val readSet = session.snapshot().tags.map { it.epc }.toSet()
        _state.update {
            it.copy(
                loading = false,
                step = InventoryStep.SCANNING,
                inventario = inv,
                offlineMode = start.offline,
                statusMessage = start.message,
                openSessions = emptyList(),
                compare = InventoryComparer.compare(expectedEpcs, readSet),
                articleCounts = InventoryArticleAggregator.fromLiveScan(expectedDetalles, readSet),
                uniqueReads = readSet.size,
                closedDetalles = emptyList(),
                report = null,
                reportFilter = ReportFilter.FALTANTES,
                error = null,
            )
        }
    }

    private fun clearSessionState(
        keepError: AppError? = null,
        message: String? = null,
    ) {
        session.clear()
        expectedEpcs = emptySet()
        expectedDetalles = emptyList()
        _state.update {
            it.copy(
                step = InventoryStep.SELECT_DEPOSITO,
                scanning = false,
                loading = false,
                inventario = null,
                compare = null,
                uniqueReads = 0,
                articleCounts = emptyList(),
                closedDetalles = emptyList(),
                report = null,
                reportFilter = ReportFilter.FALTANTES,
                offlineMode = false,
                openSessions = emptyList(),
                historySessions = emptyList(),
                openSelectionMode = false,
                selectedOpenIds = emptySet(),
                selectedDeposito = null,
                statusMessage = message,
                error = keepError,
            )
        }
        viewModelScope.launch { refreshOpenCounts() }
    }

    private fun observeReader() {
        eventsJob = viewModelScope.launch {
            reader.events().collect { event ->
                when (event) {
                    is RfidEvent.StateChanged -> {
                        _state.update {
                            it.copy(
                                readerState = event.state,
                                scanning = event.state == RfidReaderState.INVENTORY_RUNNING,
                            )
                        }
                    }
                    is RfidEvent.TagRead -> {
                        session.ingest(event.tag)
                        publishSnapshot()
                    }
                    is RfidEvent.BatchRead -> {
                        session.ingestAll(event.tags)
                        publishSnapshot()
                    }
                    is RfidEvent.Failure -> {
                        _state.update { it.copy(error = event.error, scanning = false) }
                    }
                    is RfidEvent.LocateUpdate -> Unit
                }
            }
        }
    }

    private fun publishSnapshot() {
        val snapshot = session.snapshot()
        val readSet = snapshot.tags.map { it.epc }.toSet()
        val compare = InventoryComparer.compare(expectedEpcs, readSet)
        _state.update {
            it.copy(
                uniqueReads = snapshot.uniqueTags,
                compare = compare,
                articleCounts = InventoryArticleAggregator.fromLiveScan(expectedDetalles, readSet),
            )
        }
    }

    private fun refreshCompare() {
        val snapshot = session.snapshot()
        val readSet = snapshot.tags.map { it.epc }.toSet()
        _state.update {
            it.copy(
                uniqueReads = snapshot.uniqueTags,
                compare = InventoryComparer.compare(expectedEpcs, readSet),
                articleCounts = InventoryArticleAggregator.fromLiveScan(expectedDetalles, readSet),
            )
        }
    }

    class Factory(
        private val repository: InventoryRepository,
        private val reader: RfidReader,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return InventoryViewModel(repository, reader) as T
        }
    }
}
