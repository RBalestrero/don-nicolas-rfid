package com.donnicolas.rfid.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.AssetResult
import com.donnicolas.rfid.data.repository.AssetsRepository
import com.donnicolas.rfid.rfid.LocateProximity
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTriggerMode
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AssetSearchStep {
    SELECT_ACTIVO,
    LOCATE,
}

data class AssetSearchUiState(
    val step: AssetSearchStep = AssetSearchStep.SELECT_ACTIVO,
    val query: String = "",
    val loadingList: Boolean = false,
    val activos: List<ActivoDto> = emptyList(),
    val selected: ActivoDto? = null,
    val readerState: RfidReaderState = RfidReaderState.DISCONNECTED,
    val locating: Boolean = false,
    val proximity: Int = 0,
    val rssi: Int? = null,
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

    init {
        observeReader()
        connectReader()
        search("")
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value) }
    }

    fun search(query: String = _state.value.query) {
        viewModelScope.launch {
            _state.update { it.copy(loadingList = true, error = null, query = query) }
            when (val result = assetsRepository.searchActivosConEpc(query)) {
                is AssetResult.Ok -> _state.update {
                    it.copy(loadingList = false, activos = result.value)
                }
                is AssetResult.Error -> _state.update {
                    it.copy(loadingList = false, error = result.error, activos = emptyList())
                }
            }
        }
    }

    fun selectActivo(activo: ActivoDto) {
        val epc = activo.epc?.trim()?.uppercase().orEmpty()
        if (epc.isEmpty()) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "LOCATE_NO_EPC",
                        title = "Activo sin EPC",
                        detail = "Solo se pueden localizar activos con etiqueta RFID asignada.",
                    ),
                )
            }
            return
        }
        viewModelScope.launch {
            try {
                reader.armLocateTarget(epc)
                _state.update {
                    it.copy(
                        step = AssetSearchStep.LOCATE,
                        selected = activo,
                        locating = false,
                        proximity = 0,
                        rssi = null,
                        proximityLabel = LocateProximity.label(0),
                        error = null,
                    )
                }
            } catch (e: RfidException) {
                _state.update { it.copy(error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        error = AppError(
                            code = "LOCATE_ARM_FAILED",
                            title = "No se pudo armar la localización",
                            detail = "armLocateTarget() falló.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun backToSelect() {
        viewModelScope.launch {
            runCatching { reader.stopLocate() }
            runCatching { reader.clearLocateTarget() }
            _state.update {
                it.copy(
                    step = AssetSearchStep.SELECT_ACTIVO,
                    selected = null,
                    locating = false,
                    proximity = 0,
                    rssi = null,
                    proximityLabel = LocateProximity.label(0),
                    error = null,
                )
            }
        }
    }

    fun startLocate() {
        viewModelScope.launch {
            _state.update { it.copy(error = null) }
            try {
                reader.startLocate()
            } catch (e: RfidException) {
                _state.update { it.copy(error = e.error, locating = false) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        locating = false,
                        error = AppError(
                            code = "LOCATE_START_FAILED",
                            title = "No se pudo iniciar localización",
                            detail = "startLocate() falló.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun stopLocate() {
        viewModelScope.launch {
            runCatching { reader.stopLocate() }
            _state.update { it.copy(locating = false) }
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
                            detail = "connect() falló en localización RFID.",
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
            runCatching { reader.stopLocate() }
            runCatching { reader.clearLocateTarget() }
            runCatching { reader.setTriggerMode(RfidTriggerMode.INVENTORY) }
        }
        super.onCleared()
    }

    private fun observeReader() {
        eventsJob = viewModelScope.launch {
            reader.events().collect { event ->
                when (event) {
                    is RfidEvent.StateChanged -> {
                        _state.update {
                            it.copy(
                                readerState = event.state,
                                locating = event.state == RfidReaderState.LOCATE_RUNNING,
                            )
                        }
                    }
                    is RfidEvent.LocateUpdate -> {
                        val dist = LocateProximity.clamp(event.relativeDistance)
                        _state.update {
                            it.copy(
                                locating = true,
                                proximity = dist,
                                rssi = event.rssi,
                                proximityLabel = LocateProximity.label(dist),
                            )
                        }
                    }
                    is RfidEvent.Failure -> {
                        _state.update { it.copy(error = event.error, locating = false) }
                    }
                    is RfidEvent.BatchRead, is RfidEvent.TagRead -> Unit
                }
            }
        }
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
