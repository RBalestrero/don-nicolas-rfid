package com.donnicolas.rfid.ui.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.api.ActivoUbicacionStockDto
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioListItemDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.AssetResult
import com.donnicolas.rfid.data.repository.AssetsRepository
import com.donnicolas.rfid.data.repository.InventarioStartResult
import com.donnicolas.rfid.data.repository.InventoryRepository
import com.donnicolas.rfid.data.repository.InventoryResult
import com.donnicolas.rfid.inventory.ArticleCount
import com.donnicolas.rfid.inventory.ArticleKeys
import com.donnicolas.rfid.inventory.InventoryArticleAggregator
import com.donnicolas.rfid.inventory.InventoryComparer
import com.donnicolas.rfid.inventory.InventoryCompareResult
import com.donnicolas.rfid.inventory.InventoryReport
import com.donnicolas.rfid.inventory.ReportFilter
import com.donnicolas.rfid.rfid.EpcScheme
import com.donnicolas.rfid.rfid.LocateProximity
import com.donnicolas.rfid.rfid.MatchBeeper
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
import com.donnicolas.rfid.rfid.RfidInventorySession
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTriggerMode
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

enum class InventoryStep {
    CHOICE_SCOPE,
    SELECT_ARTICULO,
    SELECT_UBICACION,
    SELECT_DEPOSITO,
    CHOICE_SESSION,
    SCANNING,
    RESULT,
    HISTORY,
}

enum class InventoryScope {
    DEPOSITO,
    ARTICULO,
}

data class InventoryUiState(
    val step: InventoryStep = InventoryStep.CHOICE_SCOPE,
    val scope: InventoryScope? = null,
    val loading: Boolean = false,
    val depositos: List<DepositoDto> = emptyList(),
    /** Cantidad de inventarios en_curso por deposito_id. */
    val openCountByDeposito: Map<String, Int> = emptyMap(),
    val selectedDeposito: DepositoDto? = null,
    val selectedActivo: ActivoDto? = null,
    val articuloQuery: String = "",
    val articuloResults: List<ActivoDto> = emptyList(),
    val searchingArticulos: Boolean = false,
    /** Slots ubicación+cantidad donde el SKU tiene stock. */
    val ubicacionesStock: List<ActivoUbicacionStockDto> = emptyList(),
    val selectedUbicacionStock: ActivoUbicacionStockDto? = null,
    /** Inventario por artículo+ubicación (sesión servidor, no conteo libre). */
    val articuloUbicacionMode: Boolean = false,
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
    /** Unidades esperadas sin EPC: el cierre las marca faltantes. */
    val sinEpcExpected: Int = 0,
    val error: AppError? = null,
)

class InventoryViewModel(
    private val repository: InventoryRepository,
    private val assetsRepository: AssetsRepository,
    private val reader: RfidReader,
) : ViewModel() {
    private val session = RfidInventorySession()
    private val matchBeeper = MatchBeeper(viewModelScope)
    private val _state = MutableStateFlow(InventoryUiState())
    val state: StateFlow<InventoryUiState> = _state.asStateFlow()

    private var eventsJob: Job? = null
    private var expectedEpcs: Set<String> = emptySet()
    private var expectedDetalles: List<DetalleInventarioDto> = emptyList()
    /** Si true, solo se ingieren EPCs del SKU (soft filter de respaldo). */
    private var articleOnlyMode: Boolean = false
    private var skuMatchCode: Long? = null
    private var skuMatchPrefix: String? = null
    private val lastPublishAtMs = AtomicLong(0)
    private var articuloSearchJob: Job? = null

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

    fun selectScope(scope: InventoryScope) {
        _state.update {
            it.copy(
                scope = scope,
                selectedActivo = null,
                articuloQuery = "",
                articuloResults = emptyList(),
                searchingArticulos = false,
                error = null,
                statusMessage = null,
                step = when (scope) {
                    InventoryScope.DEPOSITO -> InventoryStep.SELECT_DEPOSITO
                    InventoryScope.ARTICULO -> InventoryStep.SELECT_ARTICULO
                },
            )
        }
        if (scope == InventoryScope.DEPOSITO) {
            loadDepositos()
        }
    }

    fun onArticuloQueryChange(query: String) {
        _state.update { it.copy(articuloQuery = query, error = null) }
        articuloSearchJob?.cancel()
        val q = query.trim()
        if (q.length < 2) {
            _state.update { it.copy(articuloResults = emptyList(), searchingArticulos = false) }
            return
        }
        articuloSearchJob = viewModelScope.launch {
            _state.update { it.copy(searchingArticulos = true) }
            kotlinx.coroutines.delay(280)
            when (val result = assetsRepository.listActivos(q)) {
                is AssetResult.Ok -> _state.update {
                    it.copy(
                        searchingArticulos = false,
                        articuloResults = result.value.filter { a -> a.activo },
                    )
                }
                is AssetResult.Error -> _state.update {
                    it.copy(
                        searchingArticulos = false,
                        error = result.error,
                        articuloResults = emptyList(),
                    )
                }
            }
        }
    }

    fun selectArticulo(activo: ActivoDto) {
        viewModelScope.launch {
            val code = EpcScheme.articuloCodeFromPatrimonial(activo.numeroPatrimonial)
            val prefix = code?.let { EpcScheme.articuloPrefixFromCode(it) }
            if (code == null || prefix == null) {
                _state.update {
                    it.copy(
                        selectedActivo = activo,
                        error = AppError(
                            code = "SKU_CODE_INVALID",
                            title = "No se pudo derivar el código RFID del artículo",
                            detail = "El número patrimonial «${activo.numeroPatrimonial}» no genera " +
                                "un prefijo EPC válido.",
                        ),
                    )
                }
                return@launch
            }
            _state.update {
                it.copy(
                    loading = true,
                    error = null,
                    statusMessage = null,
                    selectedActivo = activo,
                    articuloQuery = activo.numeroPatrimonial,
                    articuloResults = emptyList(),
                    searchingArticulos = false,
                    ubicacionesStock = emptyList(),
                    selectedUbicacionStock = null,
                )
            }
            skuMatchCode = code
            skuMatchPrefix = prefix
            when (val result = assetsRepository.listUbicacionesStock(activo.id)) {
                is AssetResult.Ok -> {
                    if (result.value.isEmpty()) {
                        _state.update {
                            it.copy(
                                loading = false,
                                error = AppError(
                                    code = "SKU_SIN_UBICACION",
                                    title = "Sin stock ubicado",
                                    detail = "Este artículo no tiene unidades en ninguna ubicación.",
                                ),
                            )
                        }
                        return@launch
                    }
                    _state.update {
                        it.copy(
                            loading = false,
                            step = InventoryStep.SELECT_UBICACION,
                            ubicacionesStock = result.value,
                            error = null,
                        )
                    }
                }
                is AssetResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
        }
    }

    fun selectUbicacionStock(slot: ActivoUbicacionStockDto) {
        val activo = _state.value.selectedActivo ?: return
        viewModelScope.launch {
            _state.update {
                it.copy(
                    loading = true,
                    error = null,
                    selectedUbicacionStock = slot,
                    selectedDeposito = DepositoDto(
                        id = slot.depositoId,
                        nombre = slot.depositoNombre,
                    ),
                    statusMessage = null,
                )
            }
            val prefix = skuMatchPrefix
            try {
                reader.setTriggerMode(RfidTriggerMode.INVENTORY)
                if (!prefix.isNullOrBlank()) {
                    reader.armSkuInventoryFilter(prefix)
                }
            } catch (e: RfidException) {
                _state.update { it.copy(loading = false, error = e.error) }
                return@launch
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        error = AppError(
                            code = "SKU_FILTER_ARM_FAILED",
                            title = "No se pudo armar el filtro RFID",
                            detail = "Reintentá o reconectá el lector.",
                            cause = e.message,
                        ),
                    )
                }
                return@launch
            }

            val deposito = DepositoDto(id = slot.depositoId, nombre = slot.depositoNombre)
            when (
                val result = repository.startInventario(
                    deposito = deposito,
                    activoId = activo.id,
                    ubicacionId = slot.ubicacionId,
                    sectorId = slot.sectorId,
                )
            ) {
                is InventoryResult.Ok -> {
                    articleOnlyMode = true
                    _state.update { it.copy(articuloUbicacionMode = true) }
                    enterScanning(result.value, resume = false)
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
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
                    _state.update {
                        it.copy(
                            loading = false,
                            error = open.error.copy(
                                title = "No se pudieron listar inventarios abiertos",
                                detail = open.error.detail +
                                    " Reintentá. No se crea un inventario nuevo para no duplicar conteos.",
                            ),
                        )
                    }
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
                reader.setTriggerMode(RfidTriggerMode.INVENTORY)
                val prefix = skuMatchPrefix
                if (_state.value.articuloUbicacionMode && !prefix.isNullOrBlank()) {
                    reader.armSkuInventoryFilter(prefix)
                } else {
                    reader.clearSkuInventoryFilter()
                }
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
                            detail = "Reintentá. Si sigue fallando, reconectá el lector desde el menú.",
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

    /**
     * Descarta las lecturas del conteo actual y deja el inventario abierto
     * para volver a leer desde cero. En sesión online también limpia el servidor.
     */
    fun clearLecturas() {
        if (_state.value.step != InventoryStep.SCANNING) return
        val inventario = _state.value.inventario ?: return
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            val offline = _state.value.offlineMode || inventario.id.startsWith("offline-")
            if (!offline) {
                _state.update { it.copy(loading = true, error = null, scanning = false) }
                when (val result = repository.resetLecturas(inventario.id)) {
                    is InventoryResult.Ok -> applyClearedReads(
                        inventario = result.value,
                        message = "Lecturas borradas. Podés volver a leer desde cero.",
                    )
                    is InventoryResult.Error -> _state.update {
                        it.copy(loading = false, scanning = false, error = result.error)
                    }
                }
                return@launch
            }
            applyClearedReads(
                inventario = inventario,
                message = "Lecturas borradas. Podés volver a leer desde cero.",
            )
        }
    }

    fun syncLecturas() {
        val invId = _state.value.inventario?.id ?: return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            val epcs = session.epcSet().toList()
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
            val epcs = session.epcSet().toList()
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
                        report.excesos.isNotEmpty() -> ReportFilter.SOBRANTES
                        else -> ReportFilter.ENCONTRADOS
                    }
                    runCatching { reader.clearSkuInventoryFilter() }
                    _state.update {
                        it.copy(
                            loading = false,
                            step = InventoryStep.RESULT,
                            inventario = closed,
                            closedDetalles = closed.detalles,
                            report = report,
                            reportFilter = defaultFilter,
                            statusMessage = result.value.message
                                ?: "Pendiente de auditoría en la web",
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
            // Un conteo offline solo vive en memoria: no está en el servidor y no
            // se puede retomar. Salir borraría las lecturas en silencio.
            if (inv != null && (offline || inv.id.startsWith("offline-"))) {
                _state.update {
                    it.copy(
                        loading = false,
                        scanning = false,
                        statusMessage = null,
                        error = AppError(
                            code = "INVENTORY_OFFLINE_NOT_RESUMABLE",
                            title = "El conteo offline no se puede minimizar",
                            detail = "Este inventario todavía no existe en el servidor, así que no " +
                                "queda nada para retomar. Finalizalo para guardarlo (se sincroniza " +
                                "al recuperar red) o cancelalo si querés descartarlo.",
                        ),
                    )
                }
                return@launch
            }
            if (inv != null && !offline) {
                val epcs = session.epcSet().toList()
                if (epcs.isNotEmpty()) {
                    _state.update { it.copy(loading = true, scanning = false) }
                    when (val sync = repository.syncLecturas(inv.id, epcs)) {
                        is InventoryResult.Ok -> Unit
                        is InventoryResult.Error -> {
                            _state.update {
                                it.copy(
                                    loading = false,
                                    error = sync.error.copy(
                                        title = "No se pudieron guardar las lecturas",
                                        detail = sync.error.detail +
                                            " El conteo sigue acá; no minimices hasta sincronizar o cerrar.",
                                    ),
                                )
                            }
                            return@launch
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
            runCatching { reader.clearSkuInventoryFilter() }
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
                            detail = "Reintentá o reiniciá el lector desde el menú.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    override fun onCleared() {
        eventsJob?.cancel()
        matchBeeper.release()
        try {
            runBlocking(Dispatchers.IO) {
                withTimeout(1_500) { reader.stopInventory() }
            }
        } catch (_: Exception) {
            // El scope del ViewModel ya está cancelado; no se puede launch.
        }
        super.onCleared()
    }

    /** EPC del sistema que pertenece al inventario / SKU filtrado. */
    private fun isInventoryMatch(rawEpc: String): Boolean {
        val epc = EpcScheme.normalize(rawEpc)
        if (epc.isEmpty()) return false
        if (epc in expectedEpcs) return true
        if (articleOnlyMode || _state.value.articuloUbicacionMode) {
            val code = skuMatchCode
            if (code != null && LocateProximity.articuloMatches(code, epc)) return true
            val prefix = skuMatchPrefix
            if (!prefix.isNullOrBlank() && LocateProximity.articuloMatchesPrefix(prefix, epc)) {
                return true
            }
            // En modo artículo: solo ese SKU (excesos del mismo código sí cuentan).
            if (_state.value.articuloUbicacionMode) return false
        }
        val keys = ArticleKeys.ofEpc(epc)
        if (keys.isEmpty()) return false
        return expectedDetalles.any { detalle ->
            ArticleKeys.of(detalle).any { it in keys }
        }
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
        }.ifEmpty { inv.detalles }

        expectedEpcs = expectedDetalles
            .map { EpcScheme.normalize(it.epc) }
            .filter { it.isNotEmpty() }
            .toSet()

        val keepSkuFilter = _state.value.articuloUbicacionMode ||
            _state.value.scope == InventoryScope.ARTICULO
        if (keepSkuFilter) {
            articleOnlyMode = true
            // Si se perdió el prefijo, derivarlo de un EPC esperado del snapshot.
            if (skuMatchCode == null || skuMatchPrefix.isNullOrBlank()) {
                val sample = expectedEpcs.firstOrNull()
                skuMatchCode = sample?.let { EpcScheme.decodeArticuloCode(it) }
                    ?: _state.value.selectedActivo?.numeroPatrimonial?.let {
                        EpcScheme.articuloCodeFromPatrimonial(it)
                    }
                skuMatchPrefix = skuMatchCode?.let { EpcScheme.articuloPrefixFromCode(it) }
                    ?: sample?.let { EpcScheme.articuloPrefixHex(it) }
            }
            val prefix = skuMatchPrefix
            viewModelScope.launch {
                runCatching {
                    if (!prefix.isNullOrBlank()) {
                        reader.armSkuInventoryFilter(prefix)
                    }
                }
            }
        } else {
            articleOnlyMode = false
            skuMatchCode = null
            skuMatchPrefix = null
            viewModelScope.launch { runCatching { reader.clearSkuInventoryFilter() } }
        }

        val alreadyRead = inv.detalles
            .filter {
                val e = it.estado.lowercase()
                e == "encontrado" || e == "sobrante"
            }
            .map { EpcScheme.normalize(it.epc) }
            .filter { it.isNotEmpty() }

        session.clear()
        if (resume && alreadyRead.isNotEmpty()) {
            session.seedKnownEpcs(alreadyRead)
        }

        applyScanningSnapshot(
            inventario = inv,
            offline = start.offline,
            message = start.message,
            error = null,
        )
    }

    private fun applyClearedReads(inventario: InventarioDto, message: String) {
        session.clear()
        expectedDetalles = inventario.detalles.filter {
            val e = it.estado.lowercase()
            e == "esperado" || e == "encontrado"
        }.ifEmpty { inventario.detalles }
        expectedEpcs = expectedDetalles
            .map { EpcScheme.normalize(it.epc) }
            .filter { it.isNotEmpty() }
            .toSet()
        applyScanningSnapshot(
            inventario = inventario,
            offline = _state.value.offlineMode,
            message = message,
            error = null,
        )
    }

    private fun applyScanningSnapshot(
        inventario: InventarioDto,
        offline: Boolean,
        message: String?,
        error: AppError?,
    ) {
        val sinEpc = expectedDetalles.count { EpcScheme.normalize(it.epc).isEmpty() }
        val readSet = session.epcSet()
        _state.update {
            it.copy(
                loading = false,
                step = InventoryStep.SCANNING,
                scanning = false,
                inventario = inventario,
                offlineMode = offline,
                statusMessage = message,
                openSessions = emptyList(),
                compare = InventoryComparer.compare(expectedEpcs, readSet),
                articleCounts = InventoryArticleAggregator.fromLiveScan(expectedDetalles, readSet),
                uniqueReads = readSet.size,
                closedDetalles = emptyList(),
                report = null,
                reportFilter = ReportFilter.FALTANTES,
                sinEpcExpected = sinEpc,
                error = error,
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
        articleOnlyMode = false
        skuMatchCode = null
        skuMatchPrefix = null
        articuloSearchJob?.cancel()
        viewModelScope.launch { runCatching { reader.clearSkuInventoryFilter() } }
        _state.update {
            it.copy(
                step = InventoryStep.CHOICE_SCOPE,
                scope = null,
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
                sinEpcExpected = 0,
                openSessions = emptyList(),
                historySessions = emptyList(),
                openSelectionMode = false,
                selectedOpenIds = emptySet(),
                selectedDeposito = null,
                selectedActivo = null,
                articuloQuery = "",
                articuloResults = emptyList(),
                searchingArticulos = false,
                ubicacionesStock = emptyList(),
                selectedUbicacionStock = null,
                articuloUbicacionMode = false,
                statusMessage = message,
                error = keepError,
            )
        }
        viewModelScope.launch { refreshOpenCounts() }
    }

    /** Retrocede un paso en el flujo de selección (alcance → artículo → depósito). */
    fun navigateBackFromSelect() {
        when (_state.value.step) {
            InventoryStep.SELECT_UBICACION -> {
                _state.update {
                    it.copy(
                        step = InventoryStep.SELECT_ARTICULO,
                        ubicacionesStock = emptyList(),
                        selectedUbicacionStock = null,
                        selectedActivo = null,
                        articuloQuery = "",
                        articuloResults = emptyList(),
                        error = null,
                        statusMessage = null,
                    )
                }
                skuMatchCode = null
                skuMatchPrefix = null
            }
            InventoryStep.SELECT_DEPOSITO -> {
                _state.update {
                    it.copy(
                        step = InventoryStep.CHOICE_SCOPE,
                        scope = null,
                        selectedDeposito = null,
                        error = null,
                        statusMessage = null,
                    )
                }
            }
            InventoryStep.SELECT_ARTICULO -> {
                articuloSearchJob?.cancel()
                _state.update {
                    it.copy(
                        step = InventoryStep.CHOICE_SCOPE,
                        scope = null,
                        selectedActivo = null,
                        articuloQuery = "",
                        articuloResults = emptyList(),
                        searchingArticulos = false,
                        error = null,
                        statusMessage = null,
                    )
                }
            }
            InventoryStep.CHOICE_SESSION -> {
                _state.update {
                    it.copy(
                        step = InventoryStep.SELECT_DEPOSITO,
                        openSessions = emptyList(),
                        openSelectionMode = false,
                        selectedOpenIds = emptySet(),
                        selectedDeposito = null,
                        error = null,
                        statusMessage = null,
                    )
                }
            }
            else -> clearSessionState()
        }
    }

    private fun observeReader() {
        eventsJob = viewModelScope.launch(Dispatchers.Default) {
            reader.events().collect { event ->
                when (event) {
                    is RfidEvent.StateChanged -> {
                        withContext(Dispatchers.Main.immediate) {
                            _state.update {
                                it.copy(
                                    readerState = event.state,
                                    scanning = event.state == RfidReaderState.INVENTORY_RUNNING,
                                )
                            }
                        }
                    }
                    is RfidEvent.TagRead -> {
                        if (_state.value.step != InventoryStep.SCANNING) return@collect
                        val free = _state.value.articuloUbicacionMode || articleOnlyMode
                        if (free && !isInventoryMatch(event.tag.epc)) return@collect
                        if (session.ingest(event.tag) && isInventoryMatch(event.tag.epc)) {
                            matchBeeper.beepOnce()
                        }
                        publishSnapshotThrottled()
                    }
                    is RfidEvent.BatchRead -> {
                        if (_state.value.step != InventoryStep.SCANNING) return@collect
                        val free = _state.value.articuloUbicacionMode || articleOnlyMode
                        var matchedNew = 0
                        for (tag in event.tags) {
                            if (free && !isInventoryMatch(tag.epc)) continue
                            if (session.ingest(tag) && isInventoryMatch(tag.epc)) {
                                matchedNew += 1
                            }
                        }
                        if (matchedNew > 0) matchBeeper.beepMany(matchedNew)
                        publishSnapshotThrottled()
                    }
                    is RfidEvent.Failure -> {
                        withContext(Dispatchers.Main.immediate) {
                            _state.update { it.copy(error = event.error, scanning = false) }
                        }
                    }
                    is RfidEvent.LocateUpdate -> Unit
                }
            }
        }
    }

    private fun publishSnapshotThrottled() {
        val now = System.currentTimeMillis()
        if (now - lastPublishAtMs.get() < 150) return
        lastPublishAtMs.set(now)
        publishSnapshot()
    }

    private fun publishSnapshot() {
        val readSet = session.epcSet()
        val compare = InventoryComparer.compare(expectedEpcs, readSet)
        val articles = InventoryArticleAggregator.fromLiveScan(expectedDetalles, readSet)
        _state.update {
            it.copy(
                uniqueReads = readSet.size,
                compare = compare,
                articleCounts = articles,
            )
        }
    }

    private fun refreshCompare() {
        lastPublishAtMs.set(0)
        publishSnapshot()
    }

    class Factory(
        private val repository: InventoryRepository,
        private val assetsRepository: AssetsRepository,
        private val reader: RfidReader,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return InventoryViewModel(repository, assetsRepository, reader) as T
        }
    }
}
