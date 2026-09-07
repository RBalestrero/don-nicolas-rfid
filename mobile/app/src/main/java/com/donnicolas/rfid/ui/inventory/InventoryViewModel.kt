package com.donnicolas.rfid.ui.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.InventoryRepository
import com.donnicolas.rfid.data.repository.InventoryResult
import com.donnicolas.rfid.inventory.InventoryComparer
import com.donnicolas.rfid.inventory.InventoryCompareResult
import com.donnicolas.rfid.rfid.RfidEvent
import com.donnicolas.rfid.rfid.RfidException
import com.donnicolas.rfid.rfid.RfidInventorySession
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderState
import com.donnicolas.rfid.rfid.RfidTag
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class InventoryStep {
    SELECT_DEPOSITO,
    SCANNING,
    RESULT,
}

data class InventoryUiState(
    val step: InventoryStep = InventoryStep.SELECT_DEPOSITO,
    val loading: Boolean = false,
    val depositos: List<DepositoDto> = emptyList(),
    val selectedDeposito: DepositoDto? = null,
    val inventario: InventarioDto? = null,
    val readerState: RfidReaderState = RfidReaderState.DISCONNECTED,
    val scanning: Boolean = false,
    val uniqueReads: Int = 0,
    val compare: InventoryCompareResult? = null,
    val recentTags: List<RfidTag> = emptyList(),
    val closedDetalles: List<DetalleInventarioDto> = emptyList(),
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

    init {
        observeReader()
        loadDepositos()
        connectReader()
    }

    fun loadDepositos() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (val result = repository.listDepositos()) {
                is InventoryResult.Ok -> _state.update {
                    it.copy(loading = false, depositos = result.value.filter { d -> d.activo })
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
        }
    }

    fun startInventario(deposito: DepositoDto) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, selectedDeposito = deposito) }
            when (val result = repository.createInventario(deposito.id)) {
                is InventoryResult.Ok -> {
                    val inv = result.value
                    expectedEpcs = inv.detalles
                        .mapNotNull { it.epc?.trim()?.uppercase() }
                        .filter { it.isNotEmpty() }
                        .toSet()
                    session.clear()
                    _state.update {
                        it.copy(
                            loading = false,
                            step = InventoryStep.SCANNING,
                            inventario = inv,
                            compare = InventoryComparer.compare(expectedEpcs, emptySet()),
                            uniqueReads = 0,
                            recentTags = emptyList(),
                        )
                    }
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
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
                    it.copy(loading = false, inventario = result.value)
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
            refreshCompare()
        }
    }

    fun cerrarInventario() {
        val invId = _state.value.inventario?.id ?: return
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            _state.update { it.copy(loading = true, error = null, scanning = false) }
            val epcs = session.snapshot().tags.map { it.epc }
            when (val result = repository.cerrar(invId, epcs)) {
                is InventoryResult.Ok -> {
                    val closed = result.value
                    _state.update {
                        it.copy(
                            loading = false,
                            step = InventoryStep.RESULT,
                            inventario = closed,
                            closedDetalles = closed.detalles,
                            compare = InventoryComparer.compare(
                                expectedEpcs,
                                epcs.toSet(),
                            ),
                        )
                    }
                }
                is InventoryResult.Error -> _state.update {
                    it.copy(loading = false, error = result.error)
                }
            }
        }
    }

    fun backToSelect() {
        viewModelScope.launch {
            runCatching { reader.stopInventory() }
            session.clear()
            expectedEpcs = emptySet()
            _state.update {
                it.copy(
                    step = InventoryStep.SELECT_DEPOSITO,
                    scanning = false,
                    inventario = null,
                    compare = null,
                    uniqueReads = 0,
                    recentTags = emptyList(),
                    closedDetalles = emptyList(),
                    error = null,
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
            runCatching {
                reader.stopInventory()
            }
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
                }
            }
        }
    }

    private fun publishSnapshot() {
        val snapshot = session.snapshot()
        val compare = InventoryComparer.compare(
            expectedEpcs,
            snapshot.tags.map { it.epc }.toSet(),
        )
        _state.update {
            it.copy(
                uniqueReads = snapshot.uniqueTags,
                recentTags = snapshot.tags.takeLast(25).reversed(),
                compare = compare,
            )
        }
    }

    private fun refreshCompare() {
        val snapshot = session.snapshot()
        _state.update {
            it.copy(
                uniqueReads = snapshot.uniqueTags,
                compare = InventoryComparer.compare(
                    expectedEpcs,
                    snapshot.tags.map { it.epc }.toSet(),
                ),
                recentTags = snapshot.tags.takeLast(25).reversed(),
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
