package com.donnicolas.rfid.ui.search

import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.api.EtiquetaDto
import com.donnicolas.rfid.data.api.LocateMode
import com.donnicolas.rfid.data.api.LocateTargetDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.AssetResult
import com.donnicolas.rfid.data.repository.AssetsRepository
import com.donnicolas.rfid.rfid.LocateBeeper
import com.donnicolas.rfid.rfid.LocateProximity
import com.donnicolas.rfid.rfid.EpcScheme
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
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

enum class AssetSearchStep {
    SELECT_MODE,
    SELECT_ACTIVO,
    SELECT_SERIAL,
    SELECT_SERIAL_UNITS,
    LOCATE,
}

data class AssetSearchUiState(
    val step: AssetSearchStep = AssetSearchStep.SELECT_MODE,
    val query: String = "",
    val loadingList: Boolean = false,
    val targets: List<LocateTargetDto> = emptyList(),
    /** Artículos serializados al buscar por tipo (antes de listar series). */
    val serialActivos: List<ActivoDto> = emptyList(),
    val serialUnits: List<EtiquetaDto> = emptyList(),
    val serialActivo: ActivoDto? = null,
    val selected: LocateTargetDto? = null,
    val readerState: RfidReaderState = RfidReaderState.DISCONNECTED,
    val locating: Boolean = false,
    val proximity: Int = 0,
    val rssi: Int? = null,
    /** EPC de la unidad con mayor intensidad (peak-hold). */
    val hitEpc: String? = null,
    val proximityLabel: String = LocateProximity.label(0),
    val error: AppError? = null,
)

class AssetSearchViewModel(
    private val assetsRepository: AssetsRepository,
    private val reader: RfidReader,
) : ViewModel() {
    private val _state = MutableStateFlow(AssetSearchUiState())
    val state: StateFlow<AssetSearchUiState> = _state.asStateFlow()

    private var eventsJob: Job? = null
    private var peakDecayJob: Job? = null
    private val beeper = LocateBeeper(viewModelScope)

    /** Pico crudo + timestamp para peak-hold (no pisa con lecturas más débiles). */
    private var peakHeld: Int = 0
    private var peakAtMs: Long = 0L

    init {
        observeReader()
        connectReader()
    }

    fun chooseModeArticulo() {
        _state.update {
            it.copy(
                step = AssetSearchStep.SELECT_ACTIVO,
                query = "",
                targets = emptyList(),
                serialActivos = emptyList(),
                serialUnits = emptyList(),
                serialActivo = null,
                error = null,
            )
        }
        search("")
    }

    fun chooseModeSerial() {
        _state.update {
            it.copy(
                step = AssetSearchStep.SELECT_SERIAL,
                query = "",
                targets = emptyList(),
                serialActivos = emptyList(),
                serialUnits = emptyList(),
                serialActivo = null,
                error = null,
            )
        }
        searchSerial("")
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value) }
    }

    fun search(query: String = _state.value.query) {
        viewModelScope.launch {
            _state.update { it.copy(loadingList = true, error = null, query = query) }
            when (val result = assetsRepository.searchLocateTargets(query)) {
                is AssetResult.Ok -> _state.update {
                    it.copy(loadingList = false, targets = result.value)
                }
                is AssetResult.Error -> _state.update {
                    it.copy(loadingList = false, error = result.error, targets = emptyList())
                }
            }
        }
    }

    fun searchSerial(query: String = _state.value.query) {
        viewModelScope.launch {
            _state.update {
                it.copy(
                    loadingList = true,
                    error = null,
                    query = query,
                    targets = emptyList(),
                    serialActivos = emptyList(),
                )
            }
            val q = query.trim()
            val targets = mutableListOf<LocateTargetDto>()
            if (q.isNotEmpty()) {
                when (val bySerie = assetsRepository.lookupLocateBySerieFisica(q)) {
                    is AssetResult.Ok -> bySerie.value?.let { targets.add(it) }
                    is AssetResult.Error -> {
                        _state.update { it.copy(loadingList = false, error = bySerie.error) }
                        return@launch
                    }
                }
            }
            when (val arts = assetsRepository.searchSerializedActivos(q)) {
                is AssetResult.Ok -> _state.update {
                    it.copy(
                        loadingList = false,
                        targets = targets,
                        serialActivos = arts.value,
                    )
                }
                is AssetResult.Error -> _state.update {
                    it.copy(
                        loadingList = false,
                        targets = targets,
                        error = if (targets.isEmpty()) arts.error else null,
                    )
                }
            }
        }
    }

    fun selectSerializedActivo(activo: ActivoDto) {
        viewModelScope.launch {
            _state.update {
                it.copy(
                    loadingList = true,
                    error = null,
                    serialActivo = activo,
                    serialUnits = emptyList(),
                )
            }
            when (val result = assetsRepository.listEtiquetas(activo.id)) {
                is AssetResult.Ok -> {
                    val units = result.value.filter {
                        it.estado.equals("activa", ignoreCase = true)
                    }
                    _state.update {
                        it.copy(
                            loadingList = false,
                            step = AssetSearchStep.SELECT_SERIAL_UNITS,
                            serialUnits = units,
                        )
                    }
                }
                is AssetResult.Error -> _state.update {
                    it.copy(loadingList = false, error = result.error)
                }
            }
        }
    }

    fun selectSerialUnit(etiqueta: EtiquetaDto) {
        val activo = _state.value.serialActivo ?: return
        val target = assetsRepository.toLocateTargetFromEtiqueta(activo, etiqueta)
        if (target == null) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "LOCATE_NO_EPC",
                        title = "Serie sin EPC válido",
                        detail = "Esta unidad no tiene un EPC D1 para localizar.",
                    ),
                )
            }
            return
        }
        beginLocateHandoff(target)
    }

    fun selectTarget(target: LocateTargetDto) {
        beginLocateHandoff(target)
    }

    /**
     * Entra a Proximidad y arma el lector (suspende hasta que triggerMode=LOCATE).
     * Usar desde zona antes de navegar para evitar que el gatillo dispare inventario.
     */
    suspend fun armLocateHandoff(target: LocateTargetDto): Boolean {
        val epc = LocateProximity.normalizeEpc(target.epc).orEmpty()
        if (epc.isEmpty() || EpcScheme.decodeArticuloCode(epc) == null) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "LOCATE_NO_EPC",
                        title = "Artículo sin etiqueta RFID",
                        detail = "Este artículo no tiene un EPC D1 válido para localizar.",
                    ),
                )
            }
            return false
        }
        _state.update {
            it.copy(
                step = AssetSearchStep.LOCATE,
                selected = target.copy(epc = epc),
                locating = false,
                proximity = 0,
                rssi = null,
                hitEpc = null,
                proximityLabel = LocateProximity.label(0),
                error = null,
            )
        }
        return try {
            reader.armLocateTarget(epc, assetsRepository.locateMatchModeOf(target))
            beeper.stop()
            resetPeakHold()
            true
        } catch (e: RfidException) {
            _state.update { it.copy(error = e.error) }
            false
        } catch (e: Exception) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "LOCATE_ARM_FAILED",
                        title = "No se pudo preparar la localización",
                        detail = "Reintentá o reconectá el lector.",
                        cause = e.message,
                    ),
                )
            }
            false
        }
    }

    /**
     * Entra a Proximidad de inmediato (sin pasar por la lista) y arma el lector.
     * Se puede llamar antes de navegar a esta pantalla para evitar un frame de “Localizar”.
     */
    fun beginLocateHandoff(target: LocateTargetDto) {
        viewModelScope.launch {
            armLocateHandoff(target)
        }
    }

    fun backToMode() {
        viewModelScope.launch {
            releaseLocateSession()
            _state.update {
                AssetSearchUiState(
                    step = AssetSearchStep.SELECT_MODE,
                    readerState = it.readerState,
                )
            }
        }
    }

    fun backToSelect() {
        viewModelScope.launch {
            releaseLocateSession()
            val mode = _state.value.selected?.locateMode ?: LocateMode.ARTICULO
            when (mode) {
                LocateMode.SERIAL -> {
                    val hasUnits = _state.value.serialActivo != null
                    _state.update {
                        it.copy(
                            step = if (hasUnits) {
                                AssetSearchStep.SELECT_SERIAL_UNITS
                            } else {
                                AssetSearchStep.SELECT_SERIAL
                            },
                            selected = null,
                            locating = false,
                            proximity = 0,
                            rssi = null,
                            hitEpc = null,
                            proximityLabel = LocateProximity.label(0),
                            error = null,
                        )
                    }
                }
                LocateMode.ARTICULO -> _state.update {
                    it.copy(
                        step = AssetSearchStep.SELECT_ACTIVO,
                        selected = null,
                        locating = false,
                        proximity = 0,
                        rssi = null,
                        hitEpc = null,
                        proximityLabel = LocateProximity.label(0),
                        error = null,
                    )
                }
            }
        }
    }

    fun backFromSerialUnits() {
        _state.update {
            it.copy(
                step = AssetSearchStep.SELECT_SERIAL,
                serialUnits = emptyList(),
                serialActivo = null,
                error = null,
            )
        }
    }

    /** Libera el lector y luego navega (p. ej. a Inicio). Evita carrera con inventario. */
    fun leaveToHome(onDone: () -> Unit) {
        viewModelScope.launch {
            releaseLocateSession()
            _state.update {
                AssetSearchUiState(
                    step = AssetSearchStep.SELECT_MODE,
                    readerState = it.readerState,
                )
            }
            onDone()
        }
    }

    private suspend fun releaseLocateSession() {
        beeper.stop()
        stopPeakDecayTicker()
        runCatching { reader.stopLocate() }
        runCatching { reader.clearLocateTarget() }
        resetPeakHold()
    }

    fun startLocate() {
        viewModelScope.launch {
            _state.update { it.copy(error = null) }
            try {
                resetPeakHold()
                reader.startLocate()
                beeper.setProximity(0)
                beeper.start()
                startPeakDecayTicker()
            } catch (e: RfidException) {
                beeper.stop()
                stopPeakDecayTicker()
                _state.update { it.copy(error = e.error, locating = false) }
            } catch (e: Exception) {
                beeper.stop()
                stopPeakDecayTicker()
                _state.update {
                    it.copy(
                        locating = false,
                        error = AppError(
                            code = "LOCATE_START_FAILED",
                            title = "No se pudo iniciar la localización",
                            detail = "Reintentá o reconectá el lector.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun stopLocate() {
        viewModelScope.launch {
            beeper.stop()
            stopPeakDecayTicker()
            runCatching { reader.stopLocate() }
            resetPeakHold()
            _state.update {
                it.copy(
                    locating = false,
                    proximity = 0,
                    rssi = null,
                    hitEpc = null,
                    proximityLabel = LocateProximity.label(0),
                )
            }
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
                            title = "No se pudo conectar el lector",
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
        stopPeakDecayTicker()
        beeper.release()
        try {
            kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.IO) {
                kotlinx.coroutines.withTimeout(1_500) {
                    reader.stopLocate()
                    reader.clearLocateTarget()
                    reader.setTriggerMode(RfidTriggerMode.INVENTORY)
                }
            }
        } catch (_: Exception) {
        }
        super.onCleared()
    }

    private fun resetPeakHold() {
        peakHeld = 0
        peakAtMs = 0L
    }

    private fun startPeakDecayTicker() {
        if (peakDecayJob?.isActive == true) return
        peakDecayJob = viewModelScope.launch {
            while (isActive) {
                delay(PEAK_DECAY_TICK_MS)
                if (peakHeld <= 0 && _state.value.proximity <= 0) continue
                publishPeakHold(sample = null, rssi = null, epc = null)
            }
        }
    }

    private fun stopPeakDecayTicker() {
        peakDecayJob?.cancel()
        peakDecayJob = null
    }

    /**
     * Aplica peak-hold: solo una intensidad mayor actualiza barra/beep.
     * [sample] null = tick de decay sin nueva lectura RFID.
     */
    private fun publishPeakHold(sample: Int?, rssi: Int?, epc: String?) {
        val now = SystemClock.elapsedRealtime()
        val result = if (sample != null) {
            LocateProximity.applyPeakHold(peakHeld, peakAtMs, now, sample)
        } else {
            val displayed = LocateProximity.decayedPeak(peakHeld, peakAtMs, now)
            LocateProximity.PeakHoldResult(
                held = peakHeld,
                lastPeakAtMs = peakAtMs,
                displayed = displayed,
                accepted = false,
            )
        }
        peakHeld = result.held
        peakAtMs = result.lastPeakAtMs

        val displayed = result.displayed
        beeper.setProximity(displayed)
        // LocateUpdate puede llegar antes que StateChanged(LOCATE_RUNNING)
        if (sample != null) {
            beeper.start()
        }

        _state.update { prev ->
            val nextRssi = if (result.accepted) rssi else prev.rssi
            val nextHit = if (result.accepted) {
                LocateProximity.normalizeEpc(epc) ?: prev.hitEpc
            } else {
                prev.hitEpc
            }
            if (prev.proximity == displayed &&
                prev.rssi == nextRssi &&
                prev.hitEpc == nextHit &&
                prev.proximityLabel == LocateProximity.label(displayed)
            ) {
                return@update prev
            }
            prev.copy(
                // locating solo lo gobierna el lector; acá no lo forzamos con decay
                locating = if (sample != null) true else prev.locating,
                proximity = displayed,
                rssi = nextRssi,
                hitEpc = nextHit,
                proximityLabel = LocateProximity.label(displayed),
            )
        }
    }

    private fun observeReader() {
        eventsJob = viewModelScope.launch {
            reader.events().collect { event ->
                when (event) {
                    is RfidEvent.StateChanged -> {
                        val locating = event.state == RfidReaderState.LOCATE_RUNNING
                        if (locating) {
                            beeper.start()
                            startPeakDecayTicker()
                        } else if (_state.value.locating) {
                            beeper.stop()
                        }
                        _state.update {
                            it.copy(
                                readerState = event.state,
                                locating = locating,
                            )
                        }
                    }
                    is RfidEvent.LocateUpdate -> {
                        val dist = LocateProximity.resolve(event.relativeDistance, event.rssi)
                        if (dist <= 0) return@collect
                        startPeakDecayTicker()
                        publishPeakHold(sample = dist, rssi = event.rssi, epc = event.epc)
                    }
                    is RfidEvent.Failure -> {
                        beeper.stop()
                        stopPeakDecayTicker()
                        resetPeakHold()
                        _state.update {
                            it.copy(
                                error = event.error,
                                locating = false,
                                proximity = 0,
                                rssi = null,
                                hitEpc = null,
                                proximityLabel = LocateProximity.label(0),
                            )
                        }
                    }
                    is RfidEvent.BatchRead, is RfidEvent.TagRead -> Unit
                }
            }
        }
    }

    companion object {
        private const val PEAK_DECAY_TICK_MS = 100L
    }

    class Factory(
        private val assetsRepository: AssetsRepository,
        private val reader: RfidReader,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return AssetSearchViewModel(assetsRepository, reader) as T
        }
    }
}
