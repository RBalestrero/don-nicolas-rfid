package com.donnicolas.rfid

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.donnicolas.rfid.ui.auth.LoginScreen
import com.donnicolas.rfid.ui.auth.LoginViewModel
import com.donnicolas.rfid.ui.home.HomeScreen
import com.donnicolas.rfid.ui.home.HomeViewModel
import com.donnicolas.rfid.ui.inventory.InventoryScreen
import com.donnicolas.rfid.ui.inventory.InventoryStep
import com.donnicolas.rfid.ui.inventory.InventoryViewModel
import com.donnicolas.rfid.ui.rfid.RfidScanScreen
import com.donnicolas.rfid.ui.rfid.RfidScanViewModel
import com.donnicolas.rfid.ui.search.AssetSearchScreen
import com.donnicolas.rfid.ui.search.AssetSearchViewModel
import com.donnicolas.rfid.ui.theme.DonNicolasTheme

private enum class AppDestination {
    HOME,
    RFID_SCAN,
    INVENTORY,
    SEARCH,
}

class MainActivity : ComponentActivity() {
    private val loginViewModel: LoginViewModel by viewModels {
        val app = application as DonNicolasApp
        LoginViewModel.Factory(app.authRepository, app.sessionEvents)
    }

    /** Minimiza el inventario en curso si la app pasa a segundo plano / se cierra. */
    private var minimizeInventoryOnStop: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enableImmersiveMode()
        setContent {
            DonNicolasTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
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
                                DisposableEffect(inventoryState.step) {
                                    minimizeInventoryOnStop =
                                        if (inventoryState.step == InventoryStep.SCANNING) {
                                            inventoryViewModel::onAppBackgrounded
                                        } else {
                                            null
                                        }
                                    onDispose { minimizeInventoryOnStop = null }
                                }
                                InventoryScreen(
                                    state = inventoryState,
                                    onSelectDeposito = inventoryViewModel::selectDeposito,
                                    onRefreshDepositos = inventoryViewModel::loadDepositos,
                                    onStartNew = inventoryViewModel::startNewInventario,
                                    onResume = inventoryViewModel::resumeInventario,
                                    onEnterOpenSelection = inventoryViewModel::enterOpenSelectionMode,
                                    onExitOpenSelection = inventoryViewModel::exitOpenSelectionMode,
                                    onToggleOpenSelected = inventoryViewModel::toggleOpenSessionSelected,
                                    onSelectAllOpen = inventoryViewModel::selectAllOpenSessions,
                                    onClearOpenSelection = inventoryViewModel::clearOpenSelection,
                                    onCancelOpenSelected = inventoryViewModel::cancelarOpenSeleccionados,
                                    onStartScan = inventoryViewModel::startScan,
                                    onStopScan = inventoryViewModel::stopScan,
                                    onSync = inventoryViewModel::syncLecturas,
                                    onClose = inventoryViewModel::cerrarInventario,
                                    onCancel = inventoryViewModel::cancelarInventario,
                                    onLeaveWithoutClosing = inventoryViewModel::leaveWithoutClosing,
                                    onBackToSelect = inventoryViewModel::backToSelect,
                                    onFinishResult = inventoryViewModel::finishResult,
                                    onOpenHistory = inventoryViewModel::openHistory,
                                    onRefreshHistory = inventoryViewModel::refreshHistory,
                                    onBackHome = { destination = AppDestination.HOME },
                                    onReconnect = inventoryViewModel::connectReader,
                                    onReportFilter = inventoryViewModel::setReportFilter,
                                )
                            }
                            AppDestination.SEARCH -> {
                                val app = application as DonNicolasApp
                                val searchViewModel: AssetSearchViewModel = viewModel(
                                    factory = AssetSearchViewModel.Factory(
                                        app.assetsRepository,
                                        app.rfidReader,
                                    ),
                                )
                                val searchState by searchViewModel.state.collectAsState()
                                AssetSearchScreen(
                                    state = searchState,
                                    onQueryChange = searchViewModel::onQueryChange,
                                    onSearch = { searchViewModel.search() },
                                    onSelect = searchViewModel::selectTarget,
                                    onStartLocate = searchViewModel::startLocate,
                                    onStopLocate = searchViewModel::stopLocate,
                                    onBackToSelect = searchViewModel::backToSelect,
                                    onReconnect = searchViewModel::connectReader,
                                    onBack = { destination = AppDestination.HOME },
                                )
                            }
                            AppDestination.HOME -> {
                                val app = application as DonNicolasApp
                                val homeViewModel: HomeViewModel = viewModel(
                                    factory = HomeViewModel.Factory(app.inventoryRepository),
                                )
                                val homeState by homeViewModel.state.collectAsState()
                                LaunchedEffect(Unit) {
                                    homeViewModel.refreshPending()
                                }
                                HomeScreen(
                                    user = user,
                                    pendingSync = homeState.pendingSync,
                                    syncing = homeState.syncing,
                                    syncMessage = homeState.syncMessage,
                                    onOpenInventory = { destination = AppDestination.INVENTORY },
                                    onOpenSearch = { destination = AppDestination.SEARCH },
                                    onOpenRfidScan = { destination = AppDestination.RFID_SCAN },
                                    onSyncPending = homeViewModel::flushSync,
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

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) {
            minimizeInventoryOnStop?.invoke()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enableImmersiveMode()
    }

    override fun onResume() {
        super.onResume()
        enableImmersiveMode()
    }

    /** Pantalla completa: oculta barra de estado y navegación (swipe para mostrar temporal). */
    private fun enableImmersiveMode() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
}
