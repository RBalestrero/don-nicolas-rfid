package com.donnicolas.rfid.ui.articles

import android.view.KeyEvent as AndroidKeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.BannerTone
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.ErrorBanner
import com.donnicolas.rfid.ui.components.FilterChip
import com.donnicolas.rfid.ui.components.ListRow
import com.donnicolas.rfid.ui.components.MessageBanner
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.SecondaryAction
import com.donnicolas.rfid.ui.components.StatusChip
import com.donnicolas.rfid.ui.components.TertiaryAction

@Composable
fun ArticlesScreen(
    state: ArticlesUiState,
    onNumeroPatrimonialChange: (String) -> Unit,
    onDescripcionChange: (String) -> Unit,
    onSerializadoChange: (Boolean) -> Unit,
    onCategoriaSelected: (String) -> Unit,
    onDepositoSelected: (String) -> Unit,
    onSectorSelected: (String) -> Unit,
    onUbicacionSelected: (String) -> Unit,
    onCreate: () -> Unit,
    onAcceptPrint: () -> Unit,
    onDeclinePrint: () -> Unit,
    onOpenSearchExisting: () -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSelectExisting: (ActivoDto) -> Unit,
    onCantidadChange: (String) -> Unit,
    onModoChange: (EtiquetaModo) -> Unit,
    onSerieFisicaChange: (Int, String) -> Unit,
    onImprimir: () -> Unit,
    onSoloCodificar: () -> Unit,
    onFinishDone: () -> Unit,
    onClearError: () -> Unit,
    onClearStatus: () -> Unit,
    onBack: () -> Unit,
    onBackHome: () -> Unit,
) {
    val title = when (state.step) {
        ArticlesStep.FORM -> "Artículos"
        ArticlesStep.PRINT_PROMPT -> "Etiquetas"
        ArticlesStep.SEARCH_EXISTING -> "Buscar artículo"
        ArticlesStep.LABELS -> "Imprimir"
        ArticlesStep.DONE -> "Listo"
    }
    val backAction: () -> Unit = when (state.step) {
        ArticlesStep.FORM -> onBackHome
        ArticlesStep.DONE -> onFinishDone
        else -> onBack
    }

    BackHandler(onBack = backAction)

    AppScaffold(
        title = title,
        onBack = backAction,
        subtitle = state.activo?.numeroPatrimonial,
        trailing = {
            if (state.canWriteAssets) {
                StatusChip(text = "Escritura", tone = ChipTone.Ok)
            } else {
                StatusChip(text = "Solo lectura", tone = ChipTone.Warn)
            }
        },
        bottomBar = {
            when (state.step) {
                ArticlesStep.FORM -> {
                    PrimaryAction(
                        text = if (state.loading) "Guardando…" else "Guardar",
                        onClick = onCreate,
                        enabled = !state.loading && state.canWriteAssets,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                ArticlesStep.PRINT_PROMPT -> {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        PrimaryAction(
                            text = "Sí, generar etiquetas",
                            onClick = onAcceptPrint,
                            enabled = !state.loading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        SecondaryAction(
                            text = "No, después",
                            onClick = onDeclinePrint,
                            enabled = !state.loading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                ArticlesStep.SEARCH_EXISTING -> {
                    PrimaryAction(
                        text = if (state.loading) "Buscando…" else "Buscar",
                        onClick = onSearch,
                        enabled = !state.loading,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                ArticlesStep.LABELS -> {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        PrimaryAction(
                            text = if (state.loading) "Imprimiendo…" else "Imprimir",
                            onClick = onImprimir,
                            enabled = !state.loading && state.canWriteAssets,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (state.modo == EtiquetaModo.NUEVA) {
                            SecondaryAction(
                                text = if (state.loading) "Codificando…" else "Solo codificar",
                                onClick = onSoloCodificar,
                                enabled = !state.loading && state.canWriteAssets,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        TertiaryAction(
                            text = "Inicio",
                            onClick = onBackHome,
                            enabled = !state.loading,
                        )
                    }
                }
                ArticlesStep.DONE -> {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        PrimaryAction(
                            text = "Nuevo artículo",
                            onClick = onFinishDone,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        SecondaryAction(
                            text = "Inicio",
                            onClick = onBackHome,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        },
    ) {
        state.error?.let { err ->
            ErrorBanner(error = err, onDismiss = onClearError)
            Spacer(modifier = Modifier.height(6.dp))
        }
        state.statusMessage?.let { msg ->
            MessageBanner(
                message = msg,
                tone = BannerTone.Ok,
                onDismiss = onClearStatus,
            )
            Spacer(modifier = Modifier.height(6.dp))
        }

        when (state.step) {
            ArticlesStep.FORM -> FormStep(
                state = state,
                onNumeroPatrimonialChange = onNumeroPatrimonialChange,
                onDescripcionChange = onDescripcionChange,
                onSerializadoChange = onSerializadoChange,
                onCategoriaSelected = onCategoriaSelected,
                onDepositoSelected = onDepositoSelected,
                onSectorSelected = onSectorSelected,
                onUbicacionSelected = onUbicacionSelected,
                onOpenSearchExisting = onOpenSearchExisting,
            )
            ArticlesStep.PRINT_PROMPT -> PrintPromptStep(activo = state.activo)
            ArticlesStep.SEARCH_EXISTING -> SearchExistingStep(
                state = state,
                onSearchQueryChange = onSearchQueryChange,
                onSearch = onSearch,
                onSelectExisting = onSelectExisting,
            )
            ArticlesStep.LABELS -> LabelsStep(
                state = state,
                onCantidadChange = onCantidadChange,
                onModoChange = onModoChange,
                onSerieFisicaChange = onSerieFisicaChange,
            )
            ArticlesStep.DONE -> DoneStep(activo = state.activo)
        }
    }
}

@Composable
private fun FormStep(
    state: ArticlesUiState,
    onNumeroPatrimonialChange: (String) -> Unit,
    onDescripcionChange: (String) -> Unit,
    onSerializadoChange: (Boolean) -> Unit,
    onCategoriaSelected: (String) -> Unit,
    onDepositoSelected: (String) -> Unit,
    onSectorSelected: (String) -> Unit,
    onUbicacionSelected: (String) -> Unit,
    onOpenSearchExisting: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
    ) {
        if (!state.canWriteAssets) {
            MessageBanner(
                message = "Sin permiso assets.write: no podés dar de alta ni imprimir. Pedile acceso a un administrador.",
                tone = BannerTone.Warn,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        if (state.loading && state.categorias.isEmpty()) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            Spacer(modifier = Modifier.height(8.dp))
        }

        ScanFriendlyField(
            value = state.numeroPatrimonial,
            onValueChange = onNumeroPatrimonialChange,
            label = "Nº patrimonial",
            enabled = state.canWriteAssets && !state.loading,
            focusRequester = focusRequester,
            onScanConfirm = { keyboard?.hide() },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(6.dp))
        OutlinedTextField(
            value = state.descripcion,
            onValueChange = onDescripcionChange,
            label = { Text("Descripción") },
            singleLine = true,
            enabled = state.canWriteAssets && !state.loading,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(6.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            androidx.compose.material3.Checkbox(
                checked = state.serializado,
                onCheckedChange = { onSerializadoChange(it) },
                enabled = state.canWriteAssets && !state.loading,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Artículo serializado",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "Al imprimir pedirá S/N de fábrica por unidad",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))

        SimpleDropdown(
            label = "Categoría",
            options = state.categorias.map { it.id to it.nombre },
            selectedId = state.selectedCategoriaId,
            onSelected = onCategoriaSelected,
            enabled = state.canWriteAssets && !state.loading,
        )
        Spacer(modifier = Modifier.height(6.dp))
        SimpleDropdown(
            label = "Depósito",
            options = state.depositos.map { it.id to it.nombre },
            selectedId = state.selectedDepositoId,
            onSelected = onDepositoSelected,
            enabled = state.canWriteAssets && !state.loading,
        )
        Spacer(modifier = Modifier.height(6.dp))
        SimpleDropdown(
            label = "Sector",
            options = state.sectores.map { it.id to it.nombre },
            selectedId = state.selectedSectorId,
            onSelected = onSectorSelected,
            enabled = state.canWriteAssets && !state.loading && state.selectedDepositoId != null,
            loading = state.loadingTree,
        )
        Spacer(modifier = Modifier.height(6.dp))
        SimpleDropdown(
            label = "Ubicación *",
            options = state.ubicaciones.map { it.id to it.codigo },
            selectedId = state.selectedUbicacionId,
            onSelected = onUbicacionSelected,
            enabled = state.canWriteAssets && !state.loading && state.selectedSectorId != null,
        )

        Spacer(modifier = Modifier.height(10.dp))
        TertiaryAction(
            text = "Imprimir etiquetas de artículo existente",
            onClick = onOpenSearchExisting,
            enabled = state.canWriteAssets && !state.loading,
        )
    }
}

@Composable
private fun PrintPromptStep(activo: ActivoDto?) {
    Column {
        Text(
            text = "¿Generar etiquetas RFID ahora?",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = activo?.let { "${it.numeroPatrimonial} — ${it.descripcion}" }
                ?: "Artículo creado",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SearchExistingStep(
    state: ArticlesUiState,
    onSearchQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSelectExisting: (ActivoDto) -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Escaneá o escribí y confirmá con Enter para buscar.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(6.dp))
        ScanFriendlyField(
            value = state.searchQuery,
            onValueChange = onSearchQueryChange,
            label = "Buscar patrimonial / descripción",
            enabled = !state.loading,
            focusRequester = focusRequester,
            onScanConfirm = {
                keyboard?.hide()
                onSearch()
            },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(8.dp))
        if (state.loading) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 360.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(state.searchResults, key = { it.id }) { activo ->
                    ListRow(
                        title = activo.numeroPatrimonial,
                        subtitle = activo.descripcion,
                        trailing = "${activo.stockEtiquetas}",
                        onClick = { onSelectExisting(activo) },
                    )
                }
            }
            if (state.searchResults.isEmpty()) {
                Text(
                    text = if (state.searchQuery.isBlank()) {
                        "Escribí o escaneá un código para buscar el artículo."
                    } else {
                        "Sin resultados"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LabelsStep(
    state: ArticlesUiState,
    onCantidadChange: (String) -> Unit,
    onModoChange: (EtiquetaModo) -> Unit,
    onSerieFisicaChange: (Int, String) -> Unit,
) {
    val activo = state.activo
    val requiereSeries = activo?.serializado == true && state.modo == EtiquetaModo.NUEVA
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
    ) {
        Text(
            text = activo?.let { "${it.numeroPatrimonial} — ${it.descripcion}" } ?: "Artículo",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = buildString {
                append("Stock etiquetas: ${activo?.stockEtiquetas ?: 0}")
                if (activo?.serializado == true) append(" · Serializado")
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = state.cantidadText,
            onValueChange = onCantidadChange,
            label = { Text("Cantidad (1–50)") },
            singleLine = true,
            enabled = !state.loading,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Modo",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            EtiquetaModo.entries.forEach { modo ->
                FilterChip(
                    text = modo.label,
                    selected = state.modo == modo,
                    onClick = { onModoChange(modo) },
                )
            }
        }
        Text(
            text = if (state.modo == EtiquetaModo.NUEVA) {
                if (requiereSeries) {
                    "Nueva: crea EPCs y pide S/N de fábrica por unidad"
                } else {
                    "Nueva: crea EPCs y suma stock"
                }
            } else {
                "Reposición: reimprime existentes sin sumar stock"
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (requiereSeries) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Series de fábrica",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(4.dp))
            state.seriesFisicas.forEachIndexed { index, serie ->
                OutlinedTextField(
                    value = serie,
                    onValueChange = { onSerieFisicaChange(index, it) },
                    label = { Text("S/N #${index + 1}") },
                    singleLine = true,
                    enabled = !state.loading,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(4.dp))
            }
        }

        state.lastLote?.let { lote ->
            Spacer(modifier = Modifier.height(10.dp))
            MessageBanner(
                message = "Último lote: ${lote.cantidad} · stock ${lote.stockEtiquetas}",
                tone = BannerTone.Info,
            )
            Spacer(modifier = Modifier.height(4.dp))
            lote.etiquetas.take(8).forEach { item ->
                Text(
                    text = buildString {
                        append(item.epc)
                        item.serieFisica?.let { append(" · S/N $it") }
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (lote.etiquetas.size > 8) {
                Text(
                    text = "… +${lote.etiquetas.size - 8} más",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DoneStep(activo: ActivoDto?) {
    Column {
        Text(
            text = "Artículo listo",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = activo?.let { "${it.numeroPatrimonial} — ${it.descripcion}" }
                ?: "Operación completada",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * Campo orientado a wedge/barcode: foco al aparecer, ImeAction.Done,
 * Enter del scanner confirma el campo (no envía el formulario).
 */
@Composable
private fun ScanFriendlyField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    enabled: Boolean,
    focusRequester: FocusRequester,
    onScanConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        enabled = enabled,
        supportingText = {
            Text("Escaneá con la tecla Scan del teclado (no el gatillo de la pistola)")
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onScanConfirm() }),
        modifier = modifier
            .focusRequester(focusRequester)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyUp &&
                    (event.key == Key.Enter || event.nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_ENTER)
                ) {
                    onScanConfirm()
                    true
                } else {
                    false
                }
            },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SimpleDropdown(
    label: String,
    options: List<Pair<String, String>>,
    selectedId: String?,
    onSelected: (String) -> Unit,
    enabled: Boolean,
    loading: Boolean = false,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.find { it.first == selectedId }?.second.orEmpty()

    ExposedDropdownMenuBox(
        expanded = expanded && enabled,
        onExpandedChange = { if (enabled) expanded = it },
    ) {
        OutlinedTextField(
            value = when {
                loading -> "Cargando…"
                selectedLabel.isNotEmpty() -> selectedLabel
                else -> ""
            },
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(
            expanded = expanded && enabled,
            onDismissRequest = { expanded = false },
        ) {
            if (options.isEmpty()) {
                DropdownMenuItem(
                    text = { Text("Sin opciones") },
                    onClick = { expanded = false },
                    enabled = false,
                )
            } else {
                options.forEach { (id, name) ->
                    DropdownMenuItem(
                        text = { Text(name) },
                        onClick = {
                            onSelected(id)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}
