package com.donnicolas.rfid.ui.rfid

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
import com.donnicolas.rfid.rfid.RfidInventorySession
import com.donnicolas.rfid.rfid.RfidInventorySnapshot
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTag
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RfidScanUiState(
    val readerMode: String = "",
    val readerState: RfidReaderState = RfidReaderState.DISCONNECTED,
    val scanning: Boolean = false,
    val connecting: Boolean = false,
    val uniqueTags: Int = 0,
    val totalReads: Long = 0,
    val tagsPerSecond: Double = 0.0,
    val elapsedMs: Long = 0,
    val recentTags: List<RfidTag> = emptyList(),
    val error: AppError? = null,
)

class RfidScanViewModel(
    private val reader: RfidReader,
) : ViewModel() {
    private val session = RfidInventorySession()
    private val _state = MutableStateFlow(RfidScanUiState(readerMode = reader.modeName))
    val state: StateFlow<RfidScanUiState> = _state.asStateFlow()

    private var eventsJob: Job? = null

    init {
        observeEvents()
        connect()
    }

    fun connect() {
        viewModelScope.launch {
            _state.update { it.copy(connecting = true, error = null) }
            try {
                reader.connect()
                _state.update { it.copy(connecting = false) }
            } catch (e: RfidException) {
                _state.update { it.copy(connecting = false, error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        connecting = false,
                        error = AppError(
                            code = "RFID_CONNECT_FAILED",
                            title = "No se pudo conectar el lector RFID",
                            detail = "Falló connect() en modo ${reader.modeName}.",
                            cause = e.message ?: e.toString(),
                        ),
                    )
                }
            }
        }
    }

    fun startScan() {
        viewModelScope.launch {
            _state.update { it.copy(error = null) }
            try {
                session.start()
                publishSnapshot(session.snapshot())
                reader.startInventory()
                _state.update { it.copy(scanning = true) }
            } catch (e: RfidException) {
                _state.update { it.copy(scanning = false, error = e.error) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        scanning = false,
                        error = AppError(
                            code = "RFID_START_INVENTORY_FAILED",
                            title = "No se pudo iniciar la lectura masiva",
                            detail = "startInventory() falló en modo ${reader.modeName}.",
                            cause = e.message ?: e.toString(),
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
                _state.update { it.copy(scanning = false) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        scanning = false,
                        error = AppError(
                            code = "RFID_STOP_INVENTORY_FAILED",
                            title = "No se pudo detener la lectura",
                            detail = "stopInventory() falló en modo ${reader.modeName}.",
                            cause = e.message ?: e.toString(),
                        ),
                    )
                }
            }
        }
    }

    fun clearTags() {
        session.clear()
        publishSnapshot(session.snapshot())
        _state.update { it.copy(error = null) }
    }

    override fun onCleared() {
        eventsJob?.cancel()
        viewModelScope.launch {
            runCatching {
                reader.stopInventory()
                reader.disconnect()
            }
        }
        super.onCleared()
    }

    private fun observeEvents() {
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
                        publishSnapshot(session.snapshot())
                    }
                    is RfidEvent.BatchRead -> {
                        session.ingestAll(event.tags)
                        publishSnapshot(session.snapshot())
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

    private fun publishSnapshot(snapshot: RfidInventorySnapshot) {
        _state.update {
            it.copy(
                uniqueTags = snapshot.uniqueTags,
                totalReads = snapshot.totalReads,
                tagsPerSecond = snapshot.tagsPerSecond,
                elapsedMs = snapshot.elapsedMs,
                recentTags = snapshot.tags.takeLast(30).reversed(),
            )
        }
    }

    class Factory(
        private val reader: RfidReader,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return RfidScanViewModel(reader) as T
        }
    }
}
