package com.donnicolas.rfid.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.model.User

@Composable
fun HomeScreen(
    user: User,
    pendingSync: Int = 0,
    syncing: Boolean = false,
    syncMessage: String? = null,
    onOpenInventory: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenRfidScan: () -> Unit,
    onSyncPending: () -> Unit = {},
    onLogout: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Sesión activa",
            style = MaterialTheme.typography.headlineSmall,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = user.nombre,
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            text = user.email,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Rol: ${user.rol}",
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            text = "API: ${BuildConfig.API_HOST}:8000",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (pendingSync > 0) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Pendientes de sync: $pendingSync",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.tertiary,
            )
        }
        syncMessage?.let {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(28.dp))
        Button(
            onClick = onOpenInventory,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Inventario masivo")
        }
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            onClick = onOpenSearch,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Localizar activo")
        }
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onSyncPending,
            modifier = Modifier.fillMaxWidth(),
            enabled = !syncing && pendingSync > 0,
        ) {
            Text(if (syncing) "Sincronizando…" else "Sincronizar pendientes")
        }
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onOpenRfidScan,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Lectura RFID (debug)")
        }
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Salir")
        }
    }
}
