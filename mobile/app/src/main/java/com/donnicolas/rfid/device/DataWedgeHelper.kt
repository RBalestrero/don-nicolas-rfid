package com.donnicolas.rfid.device

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import java.util.ArrayList
import java.util.concurrent.atomic.AtomicInteger

/**
 * Configura DataWedge (MC33) para códigos de barras vía Keystroke.
 *
 * Hallazgos en campo (MC3300x / DataWedge 15.0.9):
 * 1. `scanner_trigger_resource` en PARAM_LIST Bundle **no desliga GUN**
 *    (SET_CONFIG → SUCCESS pero GET_CONFIG sigue con triggers=null y el imager abre).
 * 2. `barcode_trigger_mode=0` con `scanner_selection=auto` es el param documentado
 *    para "Hardware Trigger = Disabled" (TechDocs Barcode Input).
 * 3. Con Hardware Trigger OFF, solo Soft Scan API abre el imager.
 *    [MainActivity] traduce la tecla Scan (scanCode 310) a Soft Scan;
 *    el gatillo pistola (BUTTON_L1 / scanCode 744) queda para RFID SDK.
 *
 * Soft-fail: en emulador o sin DataWedge el broadcast se ignora.
 */
object DataWedgeHelper {
    private const val TAG = "DataWedgeHelper"

    const val ACTION = "com.symbol.datawedge.api.ACTION"
    const val RESULT_ACTION = "com.symbol.datawedge.api.RESULT_ACTION"
    const val EXTRA_SET_CONFIG = "com.symbol.datawedge.api.SET_CONFIG"
    const val EXTRA_GET_CONFIG = "com.symbol.datawedge.api.GET_CONFIG"
    const val PROFILE_NAME = "DonNicolas"
    const val APP_PACKAGE = "com.donnicolas.rfid"
    private const val DW_PACKAGE = "com.symbol.datawedge"

    /** Linux scan codes MC3300x (elektra-gpio-keys-gun.zkm / gpio-keys.kl). */
    const val SCAN_CODE_KEYPAD_SCAN = 310
    const val SCAN_CODE_GUN_TRIGGER = 744

    private const val CMD_ENABLE = "enable_dw"
    private const val CMD_SET_PLUGINS = "setconfig_plugins"
    private const val CMD_SET_TRIGGER = "setconfig_trigger_off"
    private const val CMD_SET_APPS = "setconfig_apps"
    private const val CMD_GET_CFG = "getconfig_barcode"
    private const val CMD_ACTIVE = "active_after_config"

    @Volatile
    private var resultReceiverRegistered = false

    @Volatile
    private var configureScheduled = false

    private val mainHandler = Handler(Looper.getMainLooper())
    private val step = AtomicInteger(0)
    private var appContextRef: Context? = null

    private val resultReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != RESULT_ACTION) return
            val cmd = intent.getStringExtra("COMMAND_IDENTIFIER").orEmpty()
            val result = intent.getStringExtra("RESULT").orEmpty()
            val active = intent.getStringExtra("com.symbol.datawedge.api.RESULT_GET_ACTIVE_PROFILE")
            val info = intent.getBundleExtra("RESULT_INFO")
            val code = info?.getString("RESULT_CODE")

            when {
                intent.hasExtra("com.symbol.datawedge.api.RESULT_GET_CONFIG") -> {
                    logGetConfig(intent.getBundleExtra("com.symbol.datawedge.api.RESULT_GET_CONFIG"))
                    configureScheduled = false
                }
                active != null -> Log.i(TAG, "Active profile='$active'")
                cmd.isNotEmpty() -> {
                    Log.i(TAG, "DW $cmd → $result${code?.let { " ($it)" } ?: ""}")
                    onCommandResult(cmd, result)
                }
            }
        }
    }

    /**
     * Habilita DataWedge y asegura el perfil [PROFILE_NAME]
     * (Hardware Trigger OFF + Keystroke + app association).
     */
    fun ensureKeystrokeProfile(context: Context) {
        try {
            val appContext = context.applicationContext
            appContextRef = appContext
            registerResultReceiver(appContext)
            if (configureScheduled) return
            configureScheduled = true
            step.set(0)

            // Cadena secuencial (DataWedge no encola bien intents concurrentes).
            sendDw(appContext) {
                putExtra("com.symbol.datawedge.api.ENABLE_DATAWEDGE", true)
                putExtra("SEND_RESULT", "true")
                putExtra("COMMAND_IDENTIFIER", CMD_ENABLE)
            }
            // Si no llega RESULT (timeout), avanzar igual.
            mainHandler.postDelayed({ advanceIfStuck(1) }, 600)
        } catch (e: Exception) {
            configureScheduled = false
            Log.w(TAG, "DataWedge no disponible: ${e.message}")
        }
    }

    private fun onCommandResult(cmd: String, result: String) {
        val ctx = appContextRef ?: return
        when (cmd) {
            CMD_ENABLE -> {
                // FAILURE DATAWEDGE_ALREADY_ENABLED también cuenta como OK.
                if (step.compareAndSet(0, 1)) {
                    mainHandler.postDelayed({ sendFullPluginConfig(ctx) }, 200)
                }
            }
            CMD_SET_PLUGINS -> {
                if (step.compareAndSet(1, 2)) {
                    // Segunda pasada: solo trigger mode, sin RESET (evita pisar).
                    mainHandler.postDelayed({ sendTriggerOffOnly(ctx) }, 300)
                }
            }
            CMD_SET_TRIGGER -> {
                if (step.compareAndSet(2, 3)) {
                    mainHandler.postDelayed({ sendAppAssociation(ctx) }, 300)
                }
            }
            CMD_SET_APPS -> {
                if (step.compareAndSet(3, 4)) {
                    mainHandler.postDelayed({
                        sendDw(ctx) {
                            putExtra("com.symbol.datawedge.api.GET_ACTIVE_PROFILE", "")
                            putExtra("SEND_RESULT", "true")
                            putExtra("COMMAND_IDENTIFIER", CMD_ACTIVE)
                        }
                        requestBarcodeConfigDump(ctx)
                        Log.i(
                            TAG,
                            "DataWedge profile '$PROFILE_NAME' aplicado " +
                                "(barcode_trigger_mode=0; Soft Scan en tecla Scan)",
                        )
                    }, 400)
                }
            }
        }
        if (result == "FAILURE" && cmd == CMD_SET_PLUGINS) {
            Log.w(TAG, "setconfig_plugins FAILURE — reintentando trigger-only")
            if (step.get() < 2) {
                step.set(2)
                mainHandler.postDelayed({ sendTriggerOffOnly(ctx) }, 400)
            }
        }
    }

    private fun advanceIfStuck(expectedStep: Int) {
        val ctx = appContextRef ?: return
        if (step.compareAndSet(0, 1) && expectedStep == 1) {
            Log.w(TAG, "Sin RESULT de enable_dw; continúo SET_CONFIG")
            sendFullPluginConfig(ctx)
        }
    }

    /** Soft Scan Trigger — solo tecla Scan del teclado. */
    fun softScan(context: Context, start: Boolean) {
        try {
            sendDw(context.applicationContext) {
                putExtra(
                    "com.symbol.datawedge.api.SOFT_SCAN_TRIGGER",
                    if (start) "START_SCANNING" else "STOP_SCANNING",
                )
            }
            Log.i(TAG, "SoftScan ${if (start) "START" else "STOP"}")
        } catch (e: Exception) {
            Log.w(TAG, "SoftScan falló: ${e.message}")
        }
    }

    fun isKeypadScanKey(event: KeyEvent): Boolean {
        if (isGunTriggerKey(event)) return false
        if (event.scanCode == SCAN_CODE_KEYPAD_SCAN) return true
        val name = KeyEvent.keyCodeToString(event.keyCode)
        return name.contains("SCAN", ignoreCase = true)
    }

    fun isGunTriggerKey(event: KeyEvent): Boolean {
        return event.scanCode == SCAN_CODE_GUN_TRIGGER ||
            event.keyCode == KeyEvent.KEYCODE_BUTTON_L1
    }

    private fun sendFullPluginConfig(context: Context) {
        val barcodePlugin = Bundle().apply {
            putString("PLUGIN_NAME", "BARCODE")
            putString("RESET_CONFIG", "true")
            putBundle(
                "PARAM_LIST",
                Bundle().apply {
                    putString("scanner_selection", "auto")
                    putString("scanner_input_enabled", "true")
                    // Hardware Trigger Disabled (docs DataWedge 15).
                    putString("barcode_trigger_mode", "0")
                },
            )
        }
        val keystrokePlugin = Bundle().apply {
            putString("PLUGIN_NAME", "KEYSTROKE")
            putString("RESET_CONFIG", "true")
            putBundle(
                "PARAM_LIST",
                Bundle().apply {
                    putString("keystroke_output_enabled", "true")
                    putString("keystroke_action_char", "13")
                    putString("keystroke_character_delay", "20")
                },
            )
        }
        val intentPlugin = Bundle().apply {
            putString("PLUGIN_NAME", "INTENT")
            putString("RESET_CONFIG", "true")
            putBundle(
                "PARAM_LIST",
                Bundle().apply {
                    putString("intent_output_enabled", "false")
                },
            )
        }
        val profileConfig = Bundle().apply {
            putString("PROFILE_NAME", PROFILE_NAME)
            putString("PROFILE_ENABLED", "true")
            putString("CONFIG_MODE", "UPDATE")
            putParcelableArrayList(
                "PLUGIN_CONFIG",
                ArrayList<Bundle>().apply {
                    add(barcodePlugin)
                    add(keystrokePlugin)
                    add(intentPlugin)
                },
            )
        }
        sendDw(context) {
            putExtra(EXTRA_SET_CONFIG, profileConfig)
            putExtra("SEND_RESULT", "true")
            putExtra("COMMAND_IDENTIFIER", CMD_SET_PLUGINS)
        }
    }

    /**
     * Pasada dedicada: solo apagar hardware trigger.
     * RESET_CONFIG=false para no reintroducir defaults.
     * PLUGIN_CONFIG como Bundle simple (estilo samples Zebra / Darryn Campbell).
     */
    private fun sendTriggerOffOnly(context: Context) {
        val barcodePlugin = Bundle().apply {
            putString("PLUGIN_NAME", "BARCODE")
            putString("RESET_CONFIG", "false")
            putBundle(
                "PARAM_LIST",
                Bundle().apply {
                    putString("scanner_selection", "auto")
                    putString("scanner_input_enabled", "true")
                    putString("barcode_trigger_mode", "0")
                },
            )
        }
        val profileConfig = Bundle().apply {
            putString("PROFILE_NAME", PROFILE_NAME)
            putString("PROFILE_ENABLED", "true")
            putString("CONFIG_MODE", "UPDATE")
            putBundle("PLUGIN_CONFIG", barcodePlugin)
        }
        sendDw(context) {
            putExtra(EXTRA_SET_CONFIG, profileConfig)
            putExtra("SEND_RESULT", "true")
            putExtra("COMMAND_IDENTIFIER", CMD_SET_TRIGGER)
        }
    }

    private fun sendAppAssociation(context: Context) {
        val appAssociation = Bundle().apply {
            putString("PACKAGE_NAME", APP_PACKAGE)
            putStringArray("ACTIVITY_LIST", arrayOf("*"))
        }
        val profileConfig = Bundle().apply {
            putString("PROFILE_NAME", PROFILE_NAME)
            putString("PROFILE_ENABLED", "true")
            putString("CONFIG_MODE", "CREATE_IF_NOT_EXIST")
            putParcelableArray("APP_LIST", arrayOf(appAssociation))
        }
        sendDw(context) {
            putExtra(EXTRA_SET_CONFIG, profileConfig)
            putExtra("SEND_RESULT", "true")
            putExtra("COMMAND_IDENTIFIER", CMD_SET_APPS)
        }
    }

    private fun requestBarcodeConfigDump(context: Context) {
        val pluginFilter = Bundle().apply {
            putString("PLUGIN_NAME", "BARCODE")
            putStringArray("PARAM_LIST", arrayOf())
        }
        val query = Bundle().apply {
            putString("PROFILE_NAME", PROFILE_NAME)
            putBundle("PLUGIN_CONFIG", pluginFilter)
        }
        sendDw(context) {
            putExtra(EXTRA_GET_CONFIG, query)
            putExtra("SEND_RESULT", "true")
            putExtra("COMMAND_IDENTIFIER", CMD_GET_CFG)
        }
    }

    private fun logGetConfig(result: Bundle?) {
        if (result == null) {
            Log.w(TAG, "GET_CONFIG result null")
            return
        }
        Log.i(TAG, "GET_CONFIG profile='${result.getString("PROFILE_NAME")}'")
        val plugins = result.getParcelableArrayList<Bundle>("PLUGIN_CONFIG") ?: run {
            Log.w(TAG, "GET_CONFIG sin PLUGIN_CONFIG")
            return
        }
        for (plugin in plugins) {
            val name = plugin.getString("PLUGIN_NAME")
            val params = plugin.getBundle("PARAM_LIST")
            if (params != null) {
                val triggerMode = params.getString("barcode_trigger_mode")
                    ?: params.getInt("barcode_trigger_mode", -1).takeIf { it >= 0 }?.toString()
                val inputEnabled = params.getString("scanner_input_enabled")
                val selection = params.getString("scanner_selection")
                    ?: params.getString("scanner_selection_by_identifier")
                // Dump keys relevantes
                val keys = params.keySet()?.filter {
                    it.contains("trigger", ignoreCase = true) ||
                        it.contains("scanner", ignoreCase = true)
                }
                Log.i(
                    TAG,
                    "GET_CONFIG $name: input=$inputEnabled trigger_mode=$triggerMode " +
                        "selection=$selection keys=$keys",
                )
                if (triggerMode == "0") {
                    Log.i(TAG, "OK hardware trigger DISABLED (barcode_trigger_mode=0)")
                } else {
                    Log.e(
                        TAG,
                        "FALLO: barcode_trigger_mode=$triggerMode (esperado 0). " +
                            "El gatillo GUN puede seguir abriendo el imager.",
                    )
                }
            } else {
                Log.i(TAG, "GET_CONFIG $name: PARAM_LIST no es Bundle")
            }
        }
    }

    private fun registerResultReceiver(appContext: Context) {
        if (resultReceiverRegistered) return
        val filter = IntentFilter(RESULT_ACTION).apply {
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(resultReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            appContext.registerReceiver(resultReceiver, filter)
        }
        resultReceiverRegistered = true
    }

    private fun sendDw(context: Context, configure: Intent.() -> Unit) {
        val intent = Intent().apply {
            action = ACTION
            setPackage(DW_PACKAGE)
            configure()
        }
        context.sendBroadcast(intent)
    }
}
