package com.donnicolas.rfid.ui.zonescan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.ActivoLookupDto
import com.donnicolas.rfid.data.api.ActivoUbicacionDto
import com.donnicolas.rfid.data.api.LocateTargetDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.AssetResult
import com.donnicolas.rfid.data.repository.AssetsRepository
import com.donnicolas.rfid.rfid.EpcScheme
import com.donnicolas.rfid.rfid.MatchBeeper
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
import com.donnicolas.rfid.rfid.RfidInventorySession
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTriggerMode
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Fila de escaneo agrupada por artículo (SKU / patrimonial).
 * [cantidad] = etiquetas distintas leídas de ese artículo.
 */
data class ZoneHit(
    val key: String,
    val numeroPatrimonial: String,
    val descripcion: String,
    val ubicacionLabel: String,
    val cantidad: Int,
    val sampleEpc: String,
    val locateTarget: LocateTargetDto?,
)

data class ZoneScanUiState(
    val readerState: RfidReaderState = RfidReaderState.DISCONNECTED,
    val scanning: Boolean = false,
    val resolving: Boolean = false,
    val uniqueReads: Int = 0,
    val registered: List<ZoneHit> = emptyList(),
    val unknownCount: Int = 0,
    val selected: ZoneHit? = null,
    val error: AppError? = null,
)

class ZoneScanViewModel(
    private val assetsRepository: AssetsRepository,
    private val reader: RfidReader,
) : ViewModel() {
    private val session = RfidInventorySession()
    private val matchBeeper = MatchBeeper(viewModelScope)
    private val _state = MutableStateFlow(ZoneScanUiState())
    val state: StateFlow<ZoneScanUiState> = _state.asStateFlow()

    private var eventsJob: Job? = null
    private var resolveJob: Job? = null
    private var pendingResolve = false

    init {
        observeEvents()
        connect()
    }

    fun connect() {
        viewModelScope.launch {
            _state.update { it.copy(error = null) }
            try {
                reader.connect()
                reader.setTriggerMode(RfidTriggerMode.INVENTORY)
            } catch (e: RfidException) {
                _state.update { it.copy(error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        error = AppError(
                            code = "RFID_CONNECT_FAILED",
                            title = "No se pudo conectar el lector",
                            detail = "Reintentá o reiniciá el lector.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    /** Al volver desde Localizar: modo inventario, sin borrar lecturas. */
    fun resumeAfterLocate() {
        viewModelScope.launch {
            runCatching { reader.stopLocate() }
            runCatching { reader.clearLocateTarget() }
            runCatching { reader.setTriggerMode(RfidTriggerMode.INVENTORY) }
            _state.update { it.copy(scanning = false, selected = null, error = null) }
            if (session.epcSet().isNotEmpty()) {
                resolveNow()
            }
        }
    }

    fun startScan() {
        viewModelScope.launch {
            _state.update { it.copy(error = null) }
            try {
                runCatching { reader.stopLocate() }
                runCatching { reader.clearLocateTarget() }
                reader.setTriggerMode(RfidTriggerMode.INVENTORY)
                // No reiniciar la sesión si ya hay lecturas (mismo patrón que inventario).
                if (_state.value.uniqueReads == 0 && session.epcSet().isEmpty()) {
                    session.start()
                    publishCounts()
                }
                reader.startInventory()
                _state.update { it.copy(scanning = true) }
                scheduleResolve()
            } catch (e: RfidException) {
                _state.update { it.copy(scanning = false, error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        scanning = false,
                        error = AppError(
                            code = "RFID_START_INVENTORY_FAILED",
                            title = "No se pudo iniciar el escaneo",
                            detail = "Reintentá. Si sigue fallando, reconectá el lector.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun stopScan() {
        viewModelScope.launch {
            try {
                reader.stopInventory()
            } catch (_: Exception) {
                // best-effort
            }
            _state.update { it.copy(scanning = false) }
            resolveNow()
        }
    }

    fun clear() {
        session.clear()
        pendingResolve = false
        resolveJob?.cancel()
        _state.update {
            it.copy(
                uniqueReads = 0,
                registered = emptyList(),
                unknownCount = 0,
                selected = null,
                error = null,
                scanning = false,
            )
        }
    }

    fun select(hit: ZoneHit) {
        _state.update { it.copy(selected = hit) }
    }

    fun clearSelection() {
        _state.update { it.copy(selected = null) }
    }

    fun prepareLocate(onReady: (LocateTargetDto) -> Unit) {
        val target = _state.value.selected?.locateTarget ?: return
        viewModelScope.launch {
            try {
                if (_state.value.scanning) {
                    runCatching { reader.stopInventory() }
                    _state.update { it.copy(scanning = false) }
                }
                onReady(target)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        error = AppError(
                            code = "ZONE_LOCATE_HANDOFF",
                            title = "No se pudo abrir localizar",
                            detail = "Pará el escaneo e intentá de nuevo.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun leave(onDone: () -> Unit) {
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            runCatching { reader.stopLocate() }
            runCatching { reader.clearLocateTarget() }
            _state.update { it.copy(scanning = false) }
            onDone()
        }
    }

    private fun observeEvents() {
        eventsJob?.cancel()
        eventsJob = viewModelScope.launch {
            reader.events().collect { event ->
                when (event) {
                    is RfidEvent.StateChanged -> {
                        val running = event.state == RfidReaderState.INVENTORY_RUNNING
                        val wasScanning = _state.value.scanning
                        _state.update {
                            it.copy(
                                readerState = event.state,
                                // Gatillo / stop del SDK: el botón sigue el estado real del lector.
                                scanning = running,
                            )
                        }
                        if (wasScanning && !running) {
                            launch { resolveNow() }
                        }
                    }
                    is RfidEvent.BatchRead -> {
                        val added = session.ingestAll(event.tags)
                        if (added > 0) matchBeeper.beepMany(added)
                        publishCounts()
                        scheduleResolve()
                    }
                    is RfidEvent.TagRead -> {
                        if (session.ingest(event.tag)) matchBeeper.beepOnce()
                        publishCounts()
                        scheduleResolve()
                    }
                    is RfidEvent.Failure -> {
                        _state.update {
                            it.copy(
                                error = event.error,
                                scanning = false,
                                readerState = RfidReaderState.ERROR,
                            )
                        }
                    }
                    is RfidEvent.LocateUpdate -> Unit
                }
            }
        }
    }

    private fun publishCounts() {
        val snap = session.snapshot()
        _state.update { it.copy(uniqueReads = snap.uniqueTags) }
    }

    private fun scheduleResolve() {
        pendingResolve = true
        if (resolveJob?.isActive == true) return
        resolveJob = viewModelScope.launch {
            while (isActive && pendingResolve) {
                pendingResolve = false
                delay(1200)
                if (!pendingResolve) {
                    resolveNow()
                }
            }
        }
    }

    private suspend fun resolveNow() {
        val allEpcs = session.epcSet()
        if (allEpcs.isEmpty()) {
            _state.update { it.copy(registered = emptyList(), unknownCount = 0, resolving = false) }
            return
        }
        _state.update { it.copy(resolving = true, error = null) }
        when (val result = assetsRepository.lookupByEpcs(allEpcs)) {
            is AssetResult.Ok -> {
                val hits = groupByArticulo(result.value.encontrados)
                _state.update {
                    it.copy(
                        resolving = false,
                        registered = hits,
                        unknownCount = result.value.noRegistrados.size,
                        selected = it.selected?.takeIf { sel -> hits.any { h -> h.key == sel.key } },
                    )
                }
            }
            is AssetResult.Error -> _state.update {
                it.copy(resolving = false, error = result.error)
            }
        }
    }

    private fun groupByArticulo(rows: List<ActivoLookupDto>): List<ZoneHit> {
        data class Acc(
            val patrimonial: String,
            val descripcion: String,
            val ubicacion: String,
            val epcs: MutableList<String>,
            val locate: LocateTargetDto?,
        )
        val buckets = linkedMapOf<String, Acc>()
        for (row in rows) {
            if (!row.encontrado) continue
            val activo = row.activo ?: continue
            val epc = EpcScheme.normalize(row.epcConsultado)
            if (epc.isEmpty()) continue
            val key = activo.id.ifBlank { activo.numeroPatrimonial }
            val existing = buckets[key]
            if (existing == null) {
                buckets[key] = Acc(
                    patrimonial = activo.numeroPatrimonial,
                    descripcion = activo.descripcion,
                    ubicacion = formatUbicacion(row.ubicacion),
                    epcs = mutableListOf(epc),
                    locate = assetsRepository.toLocateTarget(row, epc),
                )
            } else {
                if (epc !in existing.epcs) existing.epcs.add(epc)
            }
        }
        return buckets.map { (key, acc) ->
            ZoneHit(
                key = key,
                numeroPatrimonial = acc.patrimonial,
                descripcion = acc.descripcion,
                ubicacionLabel = acc.ubicacion,
                cantidad = acc.epcs.size,
                sampleEpc = acc.epcs.first(),
                locateTarget = acc.locate,
            )
        }.sortedBy { it.numeroPatrimonial }
    }

    private fun formatUbicacion(u: ActivoUbicacionDto?): String {
        if (u == null) return "Sin ubicación"
        return listOf(u.depositoNombre, u.sectorNombre, u.ubicacionCodigo)
            .filter { it.isNotBlank() }
            .joinToString(" · ")
            .ifBlank { "Sin ubicación" }
    }

    override fun onCleared() {
        eventsJob?.cancel()
        resolveJob?.cancel()
        matchBeeper.release()
        try {
            kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.IO) {
                kotlinx.coroutines.withTimeout(1_500) { reader.stopInventory() }
            }
        } catch (_: Exception) {
        }
        super.onCleared()
    }

    class Factory(
        private val assetsRepository: AssetsRepository,
        private val reader: RfidReader,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ZoneScanViewModel(assetsRepository, reader) as T
        }
    }
}
