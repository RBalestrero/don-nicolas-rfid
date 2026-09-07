package com.donnicolas.rfid.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.api.ActivoLookupDto
import com.donnicolas.rfid.data.model.AppError

@Composable
fun AssetSearchScreen(
    state: AssetSearchUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onClear: () -> Unit,
    onReconnect: () -> Unit,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Text("Búsqueda por RFID", style = MaterialTheme.typography.headlineSmall)
        Text(
            text = "Lector: ${state.readerState}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Apretá el gatillo o Iniciar para leer un tag",
            style = MaterialTheme.typography.bodyMedium,
        )

        state.error?.let {
            Spacer(modifier = Modifier.height(12.dp))
            ErrorBlock(it)
        }

        Spacer(modifier = Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            if (state.listening) {
                Button(onClick = onStop, modifier = Modifier.weight(1f)) { Text("Detener") }
            } else {
                Button(
                    onClick = onStart,
                    modifier = Modifier.weight(1f),
                    enabled = !state.lookingUp,
                ) { Text("Iniciar lectura") }
            }
            OutlinedButton(onClick = onClear, modifier = Modifier.weight(1f)) { Text("Limpiar") }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onReconnect, modifier = Modifier.weight(1f)) { Text("Reconectar") }
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
        }

        if (state.lookingUp) {
            Spacer(modifier = Modifier.height(24.dp))
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            Text(
                text = "Consultando API…",
                modifier = Modifier.align(Alignment.CenterHorizontally),
                style = MaterialTheme.typography.bodySmall,
            )
        }

        state.lastEpc?.let { epc ->
            Spacer(modifier = Modifier.height(20.dp))
            Text("EPC leído", style = MaterialTheme.typography.titleSmall)
            Text(epc, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyLarge)
        }

        state.lookup?.let { lookup ->
            Spacer(modifier = Modifier.height(16.dp))
            LookupResult(lookup)
        }
    }
}

@Composable
private fun LookupResult(lookup: ActivoLookupDto) {
    if (!lookup.encontrado || lookup.activo == null) {
        Text(
            text = lookup.mensaje ?: "Activo no encontrado",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.titleMedium,
        )
        return
    }

    val activo = lookup.activo
    Text("Activo encontrado", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
    Spacer(modifier = Modifier.height(8.dp))
    InfoLine("Patrimonial", activo.numeroPatrimonial)
    InfoLine("Descripción", activo.descripcion)
    InfoLine("Categoría", activo.categoria?.nombre ?: "—")
    InfoLine("EPC", activo.epc ?: lookup.epcConsultado)

    Spacer(modifier = Modifier.height(12.dp))
    Text("Ubicación", style = MaterialTheme.typography.titleSmall)
    val ubic = lookup.ubicacion
    if (ubic == null) {
        Text("Sin ubicación asignada", color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        InfoLine("Depósito", ubic.depositoNombre)
        InfoLine("Sector", ubic.sectorNombre)
        InfoLine("Ubicación", ubic.ubicacionCodigo)
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun ErrorBlock(error: AppError) {
    Column(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
        Text(error.code, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.error)
        Text(error.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
        Text(error.detail, style = MaterialTheme.typography.bodySmall)
    }
}
