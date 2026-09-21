package com.donnicolas.rfid.ui.home

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.donnicolas.rfid.data.model.User
import com.donnicolas.rfid.device.PresenceEstado
import com.donnicolas.rfid.ui.components.AppScaffold
import com.donnicolas.rfid.ui.components.BannerTone
import com.donnicolas.rfid.ui.components.ChipTone
import com.donnicolas.rfid.ui.components.MessageBanner
import com.donnicolas.rfid.ui.components.NavTile
import com.donnicolas.rfid.ui.components.OverflowMenuItem
import com.donnicolas.rfid.ui.components.PrimaryAction
import com.donnicolas.rfid.ui.components.StatusChip

@Composable
fun HomeScreen(
    user: User,
    presenceEstado: PresenceEstado = PresenceEstado.SESION_CERRADA,
    pendingSync: Int = 0,
    syncing: Boolean = false,
    syncMessage: String? = null,
    onOpenInventory: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenZoneScan: () -> Unit,
    onOpenArticles: () -> Unit,
    onOpenRfidScan: () -> Unit,
    onSyncPending: () -> Unit = {},
    onLogout: () -> Unit,
) {
    val (presenceLabel, presenceTone) = when (presenceEstado) {
        PresenceEstado.EN_LINEA -> "En línea" to ChipTone.Ok
        PresenceEstado.INACTIVO -> "Inactivo" to ChipTone.Warn
        PresenceEstado.SESION_CERRADA -> "Sesión cerrada" to ChipTone.Neutral
    }

    val menu = listOf(
        OverflowMenuItem(label = "Debug RFID", onClick = onOpenRfidScan),
        OverflowMenuItem(label = "Salir", destructive = true, onClick = onLogout),
    )

    AppScaffold(
        title = "Don Nicolás",
        subtitle = "Hola, ${user.nombre}",
        trailing = {
            StatusChip(text = presenceLabel, tone = presenceTone)
        },
        menuItems = menu,
        bottomBar = if (pendingSync > 0) {
            {
                PrimaryAction(
                    text = if (syncing) {
                        "Sincronizando…"
                    } else {
                        "Sincronizar ($pendingSync)"
                    },
                    onClick = onSyncPending,
                    enabled = !syncing,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        } else {
            null
        },
    ) {
        StatusChip(text = user.rol, tone = ChipTone.Accent)

        syncMessage?.let { msg ->
            Spacer(modifier = Modifier.height(8.dp))
            MessageBanner(
                message = msg,
                tone = syncBannerTone(msg),
            )
        }

        Spacer(modifier = Modifier.height(12.dp))
        NavTile(
            title = "Inventario",
            subtitle = "Contar depósito · minimizar o retomar",
            icon = Icons.Filled.Inventory2,
            onClick = onOpenInventory,
        )
        Spacer(modifier = Modifier.height(8.dp))
        NavTile(
            title = "Escanear zona",
            subtitle = "Ver artículos del sistema y su ubicación",
            icon = Icons.Filled.Sensors,
            onClick = onOpenZoneScan,
        )
        Spacer(modifier = Modifier.height(8.dp))
        NavTile(
            title = "Localizar",
            subtitle = "Buscar un tipo de artículo RFID",
            icon = Icons.Filled.Radar,
            onClick = onOpenSearch,
        )
        Spacer(modifier = Modifier.height(8.dp))
        NavTile(
            title = "Artículos",
            subtitle = "Alta e impresión",
            icon = Icons.AutoMirrored.Filled.Label,
            onClick = onOpenArticles,
        )

        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = "Tocá una opción para empezar",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun syncBannerTone(message: String): BannerTone = when {
    message.contains("error", ignoreCase = true) ||
        message.contains("No se pudo", ignoreCase = true) ||
        message.contains("parcial", ignoreCase = true) ||
        message.contains("abandonado", ignoreCase = true) -> BannerTone.Warn
    message.contains("OK", ignoreCase = true) ||
        message.contains("No hay pendientes", ignoreCase = true) -> BannerTone.Ok
    else -> BannerTone.Info
}
