package com.donnicolas.rfid.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.ActivoLookupDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.AssetResult
import com.donnicolas.rfid.data.repository.AssetsRepository
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderState
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AssetSearchUiState(
    val readerState: RfidReaderState = RfidReaderState.DISCONNECTED,
    val listening: Boolean = false,
    val lookingUp: Boolean = false,
    val lastEpc: String? = null,
    val lookup: ActivoLookupDto? = null,
    val error: AppError? = null,
)

class AssetSearchViewModel(
    private val assetsRepository: AssetsRepository,
    private val reader: RfidReader,
) : ViewModel() {
    private val _state = MutableStateFlow(AssetSearchUiState())
    val state: StateFlow<AssetSearchUiState> = _state.asStateFlow()

    private var eventsJob: Job? = null
    private val handlingTag = AtomicBoolean(false)

    init {
        observeReader()
        connectReader()
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
                            detail = "connect() falló en búsqueda por RFID.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun startListen() {
        viewModelScope.launch {
            handlingTag.set(false)
            _state.update { it.copy(error = null, lookup = null, lastEpc = null, listening = true) }
            try {
                reader.startInventory()
            } catch (e: RfidException) {
                _state.update { it.copy(listening = false, error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        listening = false,
                        error = AppError(
                            code = "SEARCH_START_FAILED",
                            title = "No se pudo iniciar la lectura",
                            detail = "startInventory() falló en búsqueda.",
                            cause = e.message,
                        ),
                    )
                }
            }
        }
    }

    fun stopListen() {
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            handlingTag.set(false)
            _state.update { it.copy(listening = false) }
        }
    }

    fun clearResult() {
        _state.update { it.copy(lookup = null, lastEpc = null, error = null) }
    }

    override fun onCleared() {
        eventsJob?.cancel()
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
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
                                listening = event.state == RfidReaderState.INVENTORY_RUNNING,
                            )
                        }
                    }
                    is RfidEvent.BatchRead -> {
                        val epc = event.tags.firstOrNull()?.epc ?: return@collect
                        onEpcRead(epc)
                    }
                    is RfidEvent.TagRead -> onEpcRead(event.tag.epc)
                    is RfidEvent.Failure -> {
                        _state.update { it.copy(error = event.error, listening = false) }
                    }
                }
            }
        }
    }

    private fun onEpcRead(epc: String) {
        if (!handlingTag.compareAndSet(false, true)) return
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            _state.update {
                it.copy(
                    listening = false,
                    lookingUp = true,
                    lastEpc = epc,
                    error = null,
                    lookup = null,
                )
            }
            when (val result = assetsRepository.lookupByEpc(epc)) {
                is AssetResult.Ok -> _state.update {
                    it.copy(lookingUp = false, lookup = result.value)
                }
                is AssetResult.Error -> _state.update {
                    it.copy(lookingUp = false, error = result.error)
                }
            }
            handlingTag.set(false)
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
