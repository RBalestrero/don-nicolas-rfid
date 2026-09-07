package com.donnicolas.rfid.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.repository.InventoryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val pendingSync: Int = 0,
    val syncing: Boolean = false,
    val syncMessage: String? = null,
)

class HomeViewModel(
    private val inventoryRepository: InventoryRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        refreshPending()
    }

    fun refreshPending() {
        viewModelScope.launch {
            val count = runCatching { inventoryRepository.pendingSyncCount() }.getOrDefault(0)
            _state.update { it.copy(pendingSync = count) }
        }
    }

    fun flushSync() {
        viewModelScope.launch {
            _state.update { it.copy(syncing = true, syncMessage = null) }
            val result = runCatching { inventoryRepository.flushSync() }
            result.onSuccess { flush ->
                val msg = when {
                    flush.processed == 0 && flush.remaining == 0 -> "No hay pendientes de sync."
                    flush.succeeded > 0 && flush.failed == 0 ->
                        "Sync OK: ${flush.succeeded} inventario(s)."
                    flush.failed > 0 ->
                        "Sync parcial: ${flush.succeeded} OK, ${flush.failed} error(es). Restan ${flush.remaining}."
                    else -> "Sin cambios. Restan ${flush.remaining}."
                }
                _state.update {
                    it.copy(
                        syncing = false,
                        pendingSync = flush.remaining,
                        syncMessage = msg,
                    )
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(
                        syncing = false,
                        syncMessage = "No se pudo sincronizar: ${e.message}",
                    )
                }
                refreshPending()
            }
        }
    }

    class Factory(
        private val inventoryRepository: InventoryRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return HomeViewModel(inventoryRepository) as T
        }
    }
}
