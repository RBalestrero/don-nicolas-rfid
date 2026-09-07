package com.donnicolas.rfid

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.donnicolas.rfid.ui.auth.LoginScreen
import com.donnicolas.rfid.ui.auth.LoginViewModel
import com.donnicolas.rfid.ui.home.HomeScreen
import com.donnicolas.rfid.ui.inventory.InventoryScreen
import com.donnicolas.rfid.ui.inventory.InventoryViewModel
import com.donnicolas.rfid.ui.rfid.RfidScanScreen
import com.donnicolas.rfid.ui.rfid.RfidScanViewModel
import com.donnicolas.rfid.ui.theme.DonNicolasTheme

private enum class AppDestination {
    HOME,
    RFID_SCAN,
    INVENTORY,
}

class MainActivity : ComponentActivity() {
    private val loginViewModel: LoginViewModel by viewModels {
        val app = application as DonNicolasApp
        LoginViewModel.Factory(app.authRepository)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DonNicolasTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val loginState by loginViewModel.state.collectAsState()
                    val user = loginState.user
                    var destination by remember { mutableStateOf(AppDestination.HOME) }

                    if (user == null) {
                        destination = AppDestination.HOME
                        LoginScreen(
                            state = loginState,
                            onEmailChange = loginViewModel::onEmailChange,
                            onPasswordChange = loginViewModel::onPasswordChange,
                            onLogin = loginViewModel::login,
                        )
                    } else {
                        when (destination) {
                            AppDestination.RFID_SCAN -> {
                                val app = application as DonNicolasApp
                                val scanViewModel: RfidScanViewModel = viewModel(
                                    factory = RfidScanViewModel.Factory(app.rfidReader),
                                )
                                val scanState by scanViewModel.state.collectAsState()
                                RfidScanScreen(
                                    state = scanState,
                                    onStart = scanViewModel::startScan,
                                    onStop = scanViewModel::stopScan,
                                    onClear = scanViewModel::clearTags,
                                    onReconnect = scanViewModel::connect,
                                    onBack = { destination = AppDestination.HOME },
                                )
                            }
                            AppDestination.INVENTORY -> {
                                val app = application as DonNicolasApp
                                val inventoryViewModel: InventoryViewModel = viewModel(
                                    factory = InventoryViewModel.Factory(
                                        app.inventoryRepository,
                                        app.rfidReader,
                                    ),
                                )
                                val inventoryState by inventoryViewModel.state.collectAsState()
                                InventoryScreen(
                                    state = inventoryState,
                                    onSelectDeposito = inventoryViewModel::startInventario,
                                    onRefreshDepositos = inventoryViewModel::loadDepositos,
                                    onStartScan = inventoryViewModel::startScan,
                                    onStopScan = inventoryViewModel::stopScan,
                                    onSync = inventoryViewModel::syncLecturas,
                                    onClose = inventoryViewModel::cerrarInventario,
                                    onBackToSelect = inventoryViewModel::backToSelect,
                                    onBackHome = { destination = AppDestination.HOME },
                                    onReconnect = inventoryViewModel::connectReader,
                                    onReportFilter = inventoryViewModel::setReportFilter,
                                )
                            }
                            AppDestination.HOME -> {
                                HomeScreen(
                                    user = user,
                                    onOpenInventory = { destination = AppDestination.INVENTORY },
                                    onOpenRfidScan = { destination = AppDestination.RFID_SCAN },
                                    onLogout = {
                                        destination = AppDestination.HOME
                                        loginViewModel.logout()
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
