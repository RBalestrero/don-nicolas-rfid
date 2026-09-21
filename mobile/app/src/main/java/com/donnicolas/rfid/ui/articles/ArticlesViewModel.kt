package com.donnicolas.rfid.ui.articles

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.api.ActivoCreateDto
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.api.CategoriaDto
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.EtiquetaLoteDto
import com.donnicolas.rfid.data.api.SectorTreeDto
import com.donnicolas.rfid.data.api.UbicacionDto
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.repository.AssetResult
import com.donnicolas.rfid.data.repository.AssetsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ArticlesStep {
    FORM,
    PRINT_PROMPT,
    SEARCH_EXISTING,
    LABELS,
    DONE,
}

enum class EtiquetaModo(val apiValue: String, val label: String) {
    NUEVA("nueva", "Nueva"),
    REPOSICION("reposicion", "Reposición"),
}

data class ArticlesUiState(
    val step: ArticlesStep = ArticlesStep.FORM,
    val canWriteAssets: Boolean = false,
    val loading: Boolean = false,
    val loadingTree: Boolean = false,
    val error: AppError? = null,
    val statusMessage: String? = null,
    // FORM
    val numeroPatrimonial: String = "",
    val descripcion: String = "",
    val serializado: Boolean = false,
    val categorias: List<CategoriaDto> = emptyList(),
    val selectedCategoriaId: String? = null,
    val depositos: List<DepositoDto> = emptyList(),
    val selectedDepositoId: String? = null,
    val sectores: List<SectorTreeDto> = emptyList(),
    val selectedSectorId: String? = null,
    val ubicaciones: List<UbicacionDto> = emptyList(),
    val selectedUbicacionId: String? = null,
    // Created / labels target
    val activo: ActivoDto? = null,
    // SEARCH_EXISTING
    val searchQuery: String = "",
    val searchResults: List<ActivoDto> = emptyList(),
    // LABELS
    val cantidadText: String = "1",
    val modo: EtiquetaModo = EtiquetaModo.NUEVA,
    /** Series de fábrica (una por unidad) cuando el artículo está serializado. */
    val seriesFisicas: List<String> = emptyList(),
    val lastLote: EtiquetaLoteDto? = null,
    /** true si LABELS se abrió tras un alta; false si vino de búsqueda de existente. */
    val labelsFromCreate: Boolean = false,
)

class ArticlesViewModel(
    private val assetsRepository: AssetsRepository,
    canWriteAssets: Boolean,
) : ViewModel() {
    private val _state = MutableStateFlow(ArticlesUiState(canWriteAssets = canWriteAssets))
    val state: StateFlow<ArticlesUiState> = _state.asStateFlow()

    init {
        loadCatalog()
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    fun clearStatus() {
        _state.update { it.copy(statusMessage = null) }
    }

    fun onNumeroPatrimonialChange(value: String) {
        _state.update { it.copy(numeroPatrimonial = value, error = null) }
    }

    fun onDescripcionChange(value: String) {
        _state.update { it.copy(descripcion = value, error = null) }
    }

    fun onSerializadoChange(value: Boolean) {
        _state.update { it.copy(serializado = value, error = null) }
    }

    fun onCategoriaSelected(id: String) {
        _state.update { it.copy(selectedCategoriaId = id, error = null) }
    }

    fun onDepositoSelected(id: String) {
        _state.update {
            it.copy(
                selectedDepositoId = id,
                selectedSectorId = null,
                selectedUbicacionId = null,
                sectores = emptyList(),
                ubicaciones = emptyList(),
                error = null,
            )
        }
        loadDepositoTree(id)
    }

    fun onSectorSelected(id: String) {
        val sectores = _state.value.sectores
        val ubicaciones = sectores.find { it.id == id }?.ubicaciones.orEmpty()
            .filter { it.activo }
        _state.update {
            it.copy(
                selectedSectorId = id,
                selectedUbicacionId = null,
                ubicaciones = ubicaciones,
                error = null,
            )
        }
    }

    fun onUbicacionSelected(id: String) {
        _state.update { it.copy(selectedUbicacionId = id, error = null) }
    }

    fun onCantidadChange(value: String) {
        val digits = value.filter { ch -> ch.isDigit() }.take(3)
        _state.update { state ->
            val cantidad = digits.toIntOrNull()?.coerceIn(1, 50) ?: 1
            val series = resizeSeries(state.seriesFisicas, cantidad, state.activo?.serializado == true && state.modo == EtiquetaModo.NUEVA)
            state.copy(cantidadText = digits, seriesFisicas = series)
        }
    }

    fun onModoChange(modo: EtiquetaModo) {
        _state.update { state ->
            val cantidad = state.cantidadText.toIntOrNull()?.coerceIn(1, 50) ?: 1
            val needsSeries = state.activo?.serializado == true && modo == EtiquetaModo.NUEVA
            state.copy(
                modo = modo,
                seriesFisicas = if (needsSeries) resizeSeries(state.seriesFisicas, cantidad, true) else emptyList(),
            )
        }
    }

    fun onSerieFisicaChange(index: Int, value: String) {
        _state.update { state ->
            val next = state.seriesFisicas.toMutableList()
            if (index in next.indices) {
                next[index] = value
            }
            state.copy(seriesFisicas = next, error = null)
        }
    }

    fun onSearchQueryChange(value: String) {
        _state.update { it.copy(searchQuery = value, error = null) }
    }

    fun createActivo() {
        if (!_state.value.canWriteAssets) {
            setPermissionError()
            return
        }
        val s = _state.value
        val validationError = ArticlesValidation.validateCreate(
            numeroPatrimonial = s.numeroPatrimonial,
            descripcion = s.descripcion,
            categoriaId = s.selectedCategoriaId,
            ubicacionId = s.selectedUbicacionId,
        )
        if (validationError != null) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "ARTICLES_VALIDATION",
                        title = "Datos incompletos",
                        detail = validationError,
                    ),
                )
            }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (
                val result = assetsRepository.createActivo(
                    ActivoCreateDto(
                        numeroPatrimonial = s.numeroPatrimonial.trim(),
                        descripcion = s.descripcion.trim(),
                        categoriaId = s.selectedCategoriaId!!,
                        ubicacionId = s.selectedUbicacionId,
                        serializado = s.serializado,
                    ),
                )
            ) {
                is AssetResult.Ok -> {
                    _state.update {
                        it.copy(
                            loading = false,
                            activo = result.value,
                            step = ArticlesStep.PRINT_PROMPT,
                            statusMessage = "Artículo ${result.value.numeroPatrimonial} creado",
                        )
                    }
                }
                is AssetResult.Error -> {
                    _state.update { it.copy(loading = false, error = result.error) }
                }
            }
        }
    }

    fun acceptPrintPrompt() {
        val activo = _state.value.activo
        _state.update {
            it.copy(
                step = ArticlesStep.LABELS,
                labelsFromCreate = true,
                statusMessage = null,
                lastLote = null,
                cantidadText = "1",
                modo = EtiquetaModo.NUEVA,
                seriesFisicas = if (activo?.serializado == true) listOf("") else emptyList(),
            )
        }
    }

    fun declinePrintPrompt() {
        _state.update {
            it.copy(
                step = ArticlesStep.DONE,
                statusMessage = "Artículo guardado sin etiquetas",
            )
        }
    }

    fun openSearchExisting() {
        if (!_state.value.canWriteAssets) {
            setPermissionError()
            return
        }
        _state.update {
            it.copy(
                step = ArticlesStep.SEARCH_EXISTING,
                searchQuery = "",
                searchResults = emptyList(),
                error = null,
                statusMessage = null,
            )
        }
    }

    fun searchExisting() {
        val q = _state.value.searchQuery
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (val result = assetsRepository.listActivos(q)) {
                is AssetResult.Ok -> {
                    _state.update {
                        it.copy(loading = false, searchResults = result.value.filter { a -> a.activo })
                    }
                }
                is AssetResult.Error -> {
                    _state.update { it.copy(loading = false, error = result.error) }
                }
            }
        }
    }

    fun selectExistingActivo(activo: ActivoDto) {
        _state.update {
            it.copy(
                activo = activo,
                step = ArticlesStep.LABELS,
                labelsFromCreate = false,
                cantidadText = "1",
                modo = EtiquetaModo.NUEVA,
                seriesFisicas = if (activo.serializado) listOf("") else emptyList(),
                lastLote = null,
                statusMessage = null,
                error = null,
            )
        }
    }

    fun imprimirEtiquetas() {
        runLabelsAction(imprimir = true)
    }

    fun soloCodificar() {
        val modo = _state.value.modo
        if (modo != EtiquetaModo.NUEVA) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "ARTICLES_REPOSICION_CODE",
                        title = "Solo impresión",
                        detail = "Reposición solo aplica a impresión (no a codificar).",
                    ),
                )
            }
            return
        }
        runLabelsAction(imprimir = false)
    }

    fun finishDone() {
        resetToForm()
    }

    fun back() {
        when (_state.value.step) {
            ArticlesStep.FORM -> Unit
            ArticlesStep.PRINT_PROMPT -> {
                _state.update { it.copy(step = ArticlesStep.DONE) }
            }
            ArticlesStep.SEARCH_EXISTING -> resetToForm()
            ArticlesStep.LABELS -> {
                val fromAlta = _state.value.labelsFromCreate
                _state.update {
                    it.copy(
                        step = if (fromAlta) ArticlesStep.PRINT_PROMPT else ArticlesStep.SEARCH_EXISTING,
                        error = null,
                    )
                }
            }
            ArticlesStep.DONE -> resetToForm()
        }
    }

    private fun runLabelsAction(imprimir: Boolean) {
        if (!_state.value.canWriteAssets) {
            setPermissionError()
            return
        }
        val activo = _state.value.activo ?: return
        val (cantidad, cantidadError) = ArticlesValidation.validateCantidadText(_state.value.cantidadText)
        if (cantidadError != null || cantidad == null) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "ARTICLES_CANTIDAD",
                        title = "Cantidad inválida",
                        detail = cantidadError ?: "Cantidad inválida",
                    ),
                )
            }
            return
        }
        val modo = _state.value.modo
        val activoState = _state.value.activo
        val seriesPayload = if (activoState?.serializado == true && modo == EtiquetaModo.NUEVA) {
            val series = _state.value.seriesFisicas.map { it.trim() }
            if (series.size != cantidad || series.any { it.isEmpty() }) {
                _state.update {
                    it.copy(
                        error = AppError(
                            code = "ARTICLES_SERIES",
                            title = "Series incompletas",
                            detail = "Ingresá el número de serie de fábrica de cada unidad ($cantidad).",
                        ),
                    )
                }
                return
            }
            val unique = series.map { it.uppercase() }.toSet()
            if (unique.size != series.size) {
                _state.update {
                    it.copy(
                        error = AppError(
                            code = "ARTICLES_SERIES_DUP",
                            title = "Series duplicadas",
                            detail = "Hay números de serie de fábrica repetidos en el lote.",
                        ),
                    )
                }
                return
            }
            series
        } else {
            null
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, statusMessage = null) }
            val result = if (imprimir) {
                assetsRepository.imprimirEtiquetas(activo.id, cantidad, modo.apiValue, seriesPayload)
            } else {
                assetsRepository.crearEtiquetas(activo.id, cantidad, seriesPayload)
            }
            when (result) {
                is AssetResult.Ok -> {
                    val lote = result.value
                    _state.update {
                        it.copy(
                            loading = false,
                            lastLote = lote,
                            activo = it.activo?.copy(stockEtiquetas = lote.stockEtiquetas)
                                ?: it.activo,
                            statusMessage = if (imprimir) {
                                if (lote.modoSimulacion) {
                                    "Simulación: ${lote.cantidad} etiqueta(s) · stock ${lote.stockEtiquetas}"
                                } else {
                                    "Impreso: ${lote.cantidad} etiqueta(s) · stock ${lote.stockEtiquetas}"
                                }
                            } else {
                                "Codificado: ${lote.cantidad} EPC(s) · stock ${lote.stockEtiquetas}"
                            },
                        )
                    }
                }
                is AssetResult.Error -> {
                    _state.update { it.copy(loading = false, error = result.error) }
                }
            }
        }
    }

    private fun resizeSeries(current: List<String>, cantidad: Int, enabled: Boolean): List<String> {
        if (!enabled) return emptyList()
        val next = current.toMutableList()
        while (next.size < cantidad) next.add("")
        return next.take(cantidad)
    }

    private fun resetToForm() {
        _state.update {
            ArticlesUiState(
                canWriteAssets = it.canWriteAssets,
                categorias = it.categorias,
                depositos = it.depositos,
            )
        }
    }

    private fun setPermissionError() {
        _state.update {
            it.copy(
                error = AppError(
                    code = "ARTICLES_NO_PERMISSION",
                    title = "Sin permiso",
                    detail = "Tu usuario no tiene el permiso assets.write. Pedile a un administrador que te lo asigne.",
                ),
            )
        }
    }

    private fun loadCatalog() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            val cats = assetsRepository.listCategorias()
            val deps = assetsRepository.listDepositos()
            var error: AppError? = null
            var categorias = emptyList<CategoriaDto>()
            var depositos = emptyList<DepositoDto>()
            when (cats) {
                is AssetResult.Ok -> categorias = cats.value.filter { it.activa }
                is AssetResult.Error -> error = cats.error
            }
            when (deps) {
                is AssetResult.Ok -> depositos = deps.value.filter { it.activo }
                is AssetResult.Error -> if (error == null) error = deps.error
            }
            _state.update {
                it.copy(
                    loading = false,
                    categorias = categorias,
                    depositos = depositos,
                    error = error,
                )
            }
        }
    }

    private fun loadDepositoTree(depositoId: String) {
        viewModelScope.launch {
            _state.update { it.copy(loadingTree = true, error = null) }
            when (val result = assetsRepository.getDepositoTree(depositoId)) {
                is AssetResult.Ok -> {
                    val sectores = result.value.sectores.filter { it.activo }
                    _state.update {
                        it.copy(
                            loadingTree = false,
                            sectores = sectores,
                            ubicaciones = emptyList(),
                        )
                    }
                }
                is AssetResult.Error -> {
                    _state.update { it.copy(loadingTree = false, error = result.error) }
                }
            }
        }
    }

    class Factory(
        private val assetsRepository: AssetsRepository,
        private val canWriteAssets: Boolean,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ArticlesViewModel(assetsRepository, canWriteAssets) as T
        }
    }
}
