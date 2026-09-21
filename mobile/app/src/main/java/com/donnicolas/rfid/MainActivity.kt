package com.donnicolas.rfid

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.donnicolas.rfid.device.DataWedgeHelper
import com.donnicolas.rfid.ui.articles.ArticlesScreen
import com.donnicolas.rfid.ui.articles.ArticlesViewModel
import com.donnicolas.rfid.ui.auth.LoginScreen
import com.donnicolas.rfid.ui.auth.LoginViewModel
import com.donnicolas.rfid.ui.components.NavLoadingOverlay
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
import com.donnicolas.rfid.ui.zonescan.ZoneScanScreen
import com.donnicolas.rfid.ui.zonescan.ZoneScanViewModel
private enum class AppDestination {
    HOME,
    RFID_SCAN,
    INVENTORY,
    SEARCH,
    ZONE_SCAN,
    ARTICLES,
}

class MainActivity : ComponentActivity() {
    private val loginViewModel: LoginViewModel by viewModels {
        val app = application as DonNicolasApp
        LoginViewModel.Factory(
            app.authRepository,
            app.sessionEvents,
            app.apiHostStore,
            app.devicePresenceReporter,
        )
    }

    /** Minimiza el inventario en curso si la app pasa a segundo plano / se cierra. */
    private var minimizeInventoryOnStop: (() -> Unit)? = null

    /**
     * Tecla Scan del teclado → Soft Scan (imager).
     * Gatillo pistola → no tocar DataWedge (RFID SDK).
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (DataWedgeHelper.isGunTriggerKey(event)) {
            return super.dispatchKeyEvent(event)
        }
        if (DataWedgeHelper.isKeypadScanKey(event)) {
            when (event.action) {
                KeyEvent.ACTION_DOWN -> {
                    if (event.repeatCount == 0) {
                        DataWedgeHelper.softScan(this, start = true)
                    }
                    return true
                }
                KeyEvent.ACTION_UP -> {
                    DataWedgeHelper.softScan(this, start = false)
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enableImmersiveMode()
        // Hardware Trigger OFF en DataWedge; tecla Scan → Soft Scan (dispatchKeyEvent).
        DataWedgeHelper.ensureKeystrokeProfile(this)
        setContent {
            DonNicolasTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    val loginState by loginViewModel.state.collectAsState()
                    val user = loginState.user
                    var destination by remember { mutableStateOf(AppDestination.HOME) }
                    /** Si Localizar se abrió desde Escanear zona, atrás vuelve ahí. */
                    var locateReturnToZone by remember { mutableStateOf(false) }
                    var navLoading by remember { mutableStateOf(false) }
                    var navLoadingMessage by remember { mutableStateOf("Cargando…") }
                    /** Destino que debe componerse antes de ocultar el spinner. */
                    var navPendingDest by remember { mutableStateOf<AppDestination?>(null) }

                    fun beginNavLoading(dest: AppDestination, message: String) {
                        navLoadingMessage = message
                        navPendingDest = dest
                        navLoading = true
                    }

                    fun navigateTo(
                        dest: AppDestination,
                        message: String = "Cargando…",
                    ) {
                        if (dest == destination && !navLoading) return
                        beginNavLoading(dest, message)
                        destination = dest
                    }

                    LaunchedEffect(user?.id) {
                        if (user == null) {
                            destination = AppDestination.HOME
                            locateReturnToZone = false
                            navPendingDest = null
                            navLoading = false
                        } else {
                            // Escáner de códigos de barras → teclado HID en campos con foco.
                            DataWedgeHelper.ensureKeystrokeProfile(this@MainActivity)
                        }
                    }

                    if (user == null) {
                        LoginScreen(
                            state = loginState,
                            onEmailChange = loginViewModel::onEmailChange,
                            onPasswordChange = loginViewModel::onPasswordChange,
                            onApiHostChange = loginViewModel::onApiHostChange,
                            onLogin = loginViewModel::login,
                        )
                    } else {
                        Box(modifier = Modifier.fillMaxSize()) {
                            AnimatedContent(
                                targetState = destination,
                                transitionSpec = {
                                    fadeIn(animationSpec = tween(90)) togetherWith
                                        fadeOut(animationSpec = tween(70))
                                },
                                label = "appDestination",
                                modifier = Modifier.fillMaxSize(),
                            ) { dest ->
                                // Primero monta la pestaña; recién entonces se va el spinner.
                                LaunchedEffect(dest, navPendingDest) {
                                    if (navPendingDest != dest) return@LaunchedEffect
                                    withFrameNanos { }
                                    withFrameNanos { }
                                    navPendingDest = null
                                    navLoading = false
                                }
                                when (dest) {
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
                                            onBack = { navigateTo(AppDestination.HOME) },
                                        )
                                    }
                                    AppDestination.INVENTORY -> {
                                        val app = application as DonNicolasApp
                                        val inventoryViewModel: InventoryViewModel = viewModel(
                                            factory = InventoryViewModel.Factory(
                                                app.inventoryRepository,
                                                app.assetsRepository,
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
                                            onSelectScope = inventoryViewModel::selectScope,
                                            onArticuloQueryChange = inventoryViewModel::onArticuloQueryChange,
                                            onSelectArticulo = inventoryViewModel::selectArticulo,
                                            onSelectUbicacionStock = inventoryViewModel::selectUbicacionStock,
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
                                            onClearReads = inventoryViewModel::clearLecturas,
                                            onSync = inventoryViewModel::syncLecturas,
                                            onClose = inventoryViewModel::cerrarInventario,
                                            onCancel = inventoryViewModel::cancelarInventario,
                                            onLeaveWithoutClosing = inventoryViewModel::leaveWithoutClosing,
                                            onBackToSelect = inventoryViewModel::backToSelect,
                                            onNavigateBackFromSelect = inventoryViewModel::navigateBackFromSelect,
                                            onFinishResult = inventoryViewModel::finishResult,
                                            onOpenHistory = inventoryViewModel::openHistory,
                                            onRefreshHistory = inventoryViewModel::refreshHistory,
                                            onBackHome = { navigateTo(AppDestination.HOME) },
                                            onReconnect = inventoryViewModel::connectReader,
                                            onReportFilter = inventoryViewModel::setReportFilter,
                                        )
                                    }
                                    AppDestination.ZONE_SCAN -> {
                                        val app = application as DonNicolasApp
                                        val zoneViewModel: ZoneScanViewModel = viewModel(
                                            factory = ZoneScanViewModel.Factory(
                                                app.assetsRepository,
                                                app.rfidReader,
                                            ),
                                        )
                                        val zoneState by zoneViewModel.state.collectAsState()
                                        LaunchedEffect(Unit) {
                                            zoneViewModel.resumeAfterLocate()
                                        }
                                        ZoneScanScreen(
                                            state = zoneState,
                                            onStart = zoneViewModel::startScan,
                                            onStop = zoneViewModel::stopScan,
                                            onClear = zoneViewModel::clear,
                                            onSelect = zoneViewModel::select,
                                            onClearSelection = zoneViewModel::clearSelection,
                                            onLocate = { target ->
                                                beginNavLoading(AppDestination.SEARCH, "Preparando localización…")
                                                val searchVm = ViewModelProvider(
                                                    this@MainActivity,
                                                    AssetSearchViewModel.Factory(
                                                        app.assetsRepository,
                                                        app.rfidReader,
                                                    ),
                                                )[AssetSearchViewModel::class.java]
                                                searchVm.beginLocateHandoff(target)
                                                locateReturnToZone = true
                                                destination = AppDestination.SEARCH
                                            },
                                            onPrepareLocate = zoneViewModel::prepareLocate,
                                            onReconnect = zoneViewModel::connect,
                                            onBack = {
                                                beginNavLoading(AppDestination.HOME, "Cargando…")
                                                zoneViewModel.leave {
                                                    destination = AppDestination.HOME
                                                }
                                            },
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
                                        val returnToZone = locateReturnToZone
                                        AssetSearchScreen(
                                            state = searchState,
                                            onQueryChange = searchViewModel::onQueryChange,
                                            onSearch = { searchViewModel.search() },
                                            onSelect = searchViewModel::selectTarget,
                                            onStartLocate = searchViewModel::startLocate,
                                            onStopLocate = searchViewModel::stopLocate,
                                            onBackToSelect = searchViewModel::backToSelect,
                                            onBackFromLocate = if (returnToZone) {
                                                {
                                                    beginNavLoading(AppDestination.ZONE_SCAN, "Volviendo al escaneo…")
                                                    searchViewModel.leaveToHome {
                                                        locateReturnToZone = false
                                                        destination = AppDestination.ZONE_SCAN
                                                    }
                                                }
                                            } else {
                                                null
                                            },
                                            onLeaveToHome = {
                                                locateReturnToZone = false
                                                beginNavLoading(AppDestination.HOME, "Cargando…")
                                                searchViewModel.leaveToHome {
                                                    destination = AppDestination.HOME
                                                }
                                            },
                                            onReconnect = searchViewModel::connectReader,
                                            onBack = {
                                                if (returnToZone) {
                                                    beginNavLoading(AppDestination.ZONE_SCAN, "Volviendo al escaneo…")
                                                    searchViewModel.leaveToHome {
                                                        locateReturnToZone = false
                                                        destination = AppDestination.ZONE_SCAN
                                                    }
                                                } else {
                                                    navigateTo(AppDestination.HOME)
                                                }
                                            },
                                        )
                                    }
                                    AppDestination.ARTICLES -> {
                                        val app = application as DonNicolasApp
                                        LaunchedEffect(Unit) {
                                            DataWedgeHelper.ensureKeystrokeProfile(this@MainActivity)
                                        }
                                        val articlesViewModel: ArticlesViewModel = viewModel(
                                            factory = ArticlesViewModel.Factory(
                                                app.assetsRepository,
                                                canWriteAssets = user.canWriteAssets(),
                                            ),
                                        )
                                        val articlesState by articlesViewModel.state.collectAsState()
                                        ArticlesScreen(
                                            state = articlesState,
                                            onNumeroPatrimonialChange = articlesViewModel::onNumeroPatrimonialChange,
                                            onDescripcionChange = articlesViewModel::onDescripcionChange,
                                            onSerializadoChange = articlesViewModel::onSerializadoChange,
                                            onCategoriaSelected = articlesViewModel::onCategoriaSelected,
                                            onDepositoSelected = articlesViewModel::onDepositoSelected,
                                            onSectorSelected = articlesViewModel::onSectorSelected,
                                            onUbicacionSelected = articlesViewModel::onUbicacionSelected,
                                            onCreate = articlesViewModel::createActivo,
                                            onAcceptPrint = articlesViewModel::acceptPrintPrompt,
                                            onDeclinePrint = articlesViewModel::declinePrintPrompt,
                                            onOpenSearchExisting = articlesViewModel::openSearchExisting,
                                            onSearchQueryChange = articlesViewModel::onSearchQueryChange,
                                            onSearch = articlesViewModel::searchExisting,
                                            onSelectExisting = articlesViewModel::selectExistingActivo,
                                            onCantidadChange = articlesViewModel::onCantidadChange,
                                            onModoChange = articlesViewModel::onModoChange,
                                            onSerieFisicaChange = articlesViewModel::onSerieFisicaChange,
                                            onImprimir = articlesViewModel::imprimirEtiquetas,
                                            onSoloCodificar = articlesViewModel::soloCodificar,
                                            onFinishDone = articlesViewModel::finishDone,
                                            onClearError = articlesViewModel::clearError,
                                            onClearStatus = articlesViewModel::clearStatus,
                                            onBack = articlesViewModel::back,
                                            onBackHome = { navigateTo(AppDestination.HOME) },
                                        )
                                    }
                                    AppDestination.HOME -> {
                                        val app = application as DonNicolasApp
                                        val homeViewModel: HomeViewModel = viewModel(
                                            factory = HomeViewModel.Factory(app.inventoryRepository),
                                        )
                                        val homeState by homeViewModel.state.collectAsState()
                                        val presenceEstado by app.devicePresenceReporter.estado.collectAsState()
                                        LaunchedEffect(Unit) {
                                            homeViewModel.refreshPending()
                                        }
                                        HomeScreen(
                                            user = user,
                                            presenceEstado = presenceEstado,
                                            pendingSync = homeState.pendingSync,
                                            syncing = homeState.syncing,
                                            syncMessage = homeState.syncMessage,
                                            onOpenInventory = {
                                                navigateTo(AppDestination.INVENTORY, "Abriendo inventario…")
                                            },
                                            onOpenZoneScan = {
                                                navigateTo(AppDestination.ZONE_SCAN, "Abriendo escaneo…")
                                            },
                                            onOpenSearch = {
                                                navigateTo(AppDestination.SEARCH, "Abriendo localizar…")
                                            },
                                            onOpenArticles = {
                                                navigateTo(AppDestination.ARTICLES, "Abriendo artículos…")
                                            },
                                            onOpenRfidScan = {
                                                navigateTo(AppDestination.RFID_SCAN, "Abriendo lector…")
                                            },
                                            onSyncPending = homeViewModel::flushSync,
                                            onLogout = {
                                                destination = AppDestination.HOME
                                                loginViewModel.logout()
                                            },
                                        )
                                    }
                                }
                            }

                            NavLoadingOverlay(
                                visible = navLoading,
                                message = navLoadingMessage,
                            )
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
        DataWedgeHelper.ensureKeystrokeProfile(this)
    }

    /** Pantalla completa: oculta barra de estado y navegación (swipe para mostrar temporal). */
    private fun enableImmersiveMode() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
}
