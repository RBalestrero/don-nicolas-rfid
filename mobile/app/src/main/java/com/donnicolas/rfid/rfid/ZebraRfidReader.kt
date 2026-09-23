package com.donnicolas.rfid.rfid

import android.content.Context
import android.os.Build
import android.util.Log
import com.donnicolas.rfid.data.model.AppError
import com.zebra.rfid.api3.BEEPER_VOLUME
import com.zebra.rfid.api3.ENUM_TRANSPORT
import com.zebra.rfid.api3.FILTER_ACTION
import com.zebra.rfid.api3.HANDHELD_TRIGGER_EVENT_TYPE
import com.zebra.rfid.api3.InvalidUsageException
import com.zebra.rfid.api3.MEMORY_BANK
import com.zebra.rfid.api3.OperationFailureException
import com.zebra.rfid.api3.PreFilters
import com.zebra.rfid.api3.RFIDReader
import com.zebra.rfid.api3.UNIQUE_TAG_REPORT_SETTING
import com.zebra.rfid.api3.RFIDResults
import com.zebra.rfid.api3.ReaderDevice
import com.zebra.rfid.api3.Readers
import com.zebra.rfid.api3.RegionInfo
import com.zebra.rfid.api3.RfidEventsListener
import com.zebra.rfid.api3.RfidReadEvents
import com.zebra.rfid.api3.RfidStatusEvents
import com.zebra.rfid.api3.SL_FLAG
import com.zebra.rfid.api3.STATE_AWARE_ACTION
import com.zebra.rfid.api3.STATUS_EVENT_TYPE
import com.zebra.rfid.api3.TARGET
import com.zebra.rfid.api3.TRUNCATE_ACTION
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Adaptador Zebra RFID API3 para handheld MC33xx.
 *
 * No pisa potencia/sesión/triggers de config RF: respeta 123RFID.
 * El gatillo de pistola (HANDHELD_TRIGGER) dispara inventario o localización
 * según [RfidTriggerMode]. DataWedge debe dejar libre el recurso GUN
 * (ver [com.donnicolas.rfid.device.DataWedgeHelper]) para evitar conflicto
 * con el imager óptico.
 */
class ZebraRfidReader(
    context: Context,
) : RfidReader {
    override val modeName: String = "ZEBRA"

    private val appContext = context.applicationContext
    private val eventBus = RfidEventBus()
    private val mutex = Mutex()
    private val inventoryLock = ReentrantLock()
    private val inventoryRunning = AtomicBoolean(false)
    private val locateRunning = AtomicBoolean(false)
    @Volatile private var triggerMode: RfidTriggerMode = RfidTriggerMode.INVENTORY
    /** EPC de muestra del artículo (cualquier unidad); el match es por código ART. */
    @Volatile private var locateTargetEpc: String? = null
    /** Código de artículo (40 bits) armado para localización por SKU. */
    @Volatile private var locateArticuloCode: Long? = null
    /** Prefijo D1+ART (12 hex / 48 bits) para PreFilter Gen2. */
    @Volatile private var locatePrefix: String? = null
    /** SKU (cualquier serial) vs SERIAL (EPC exacto). */
    @Volatile private var locateMatchMode: LocateMatchMode = LocateMatchMode.SKU
    /** Prefijo SKU armado para inventario filtrado (conteo libre). */
    @Volatile private var inventorySkuPrefix: String? = null
    /** multi / single / filter (PreFilter+Inventory+RSSI) */
    @Volatile private var locateEngine: String = LOCATE_NONE
    @Volatile private var savedSlFlag: SL_FLAG? = null
    @Volatile private var savedUniqueTagReport: UNIQUE_TAG_REPORT_SETTING? = null
    @Volatile private var savedBeeperVolume: BEEPER_VOLUME? = null
    private val inventoryExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { r ->
            Thread(r, "zebra-rfid-inventory").apply { isDaemon = true }
        }

    private var readers: Readers? = null
    private var reader: RFIDReader? = null
    private var eventHandler: EventHandler? = null

    override fun events(): Flow<RfidEvent> = eventBus.events()

    override suspend fun connect() = withContext(Dispatchers.IO) {
        mutex.withLock {
            emitState(RfidReaderState.CONNECTING)
            try {
                if (reader?.isConnected == true) {
                    emitState(RfidReaderState.READY)
                    return@withLock
                }

                val available = discoverReaders()
                if (available.isEmpty()) {
                    throw failure(
                        code = "RFID_NO_READER_FOUND",
                        title = "No hay lector RFID disponible",
                        detail = "GetAvailableRFIDReaderList() devolvió vacío en ${Build.MODEL}. " +
                            "Cerrá 123RFID / RFID Demo si están abiertas y reintentá.",
                    )
                }

                val device = available.first()
                val rfidReader = device.rfidReader
                    ?: throw failure(
                        code = "RFID_READER_NULL",
                        title = "ReaderDevice sin RFIDReader",
                        detail = "El dispositivo '${device.name}' no expuso getRFIDReader().",
                    )

                connectWithRecovery(rfidReader, device.name)

                if (!rfidReader.isConnected) {
                    throw failure(
                        code = "RFID_CONNECT_NOT_CONNECTED",
                        title = "Lector no quedó conectado",
                        detail = "connect() terminó sin isConnected=true para '${device.name}'.",
                    )
                }

                attachEventsOnly(rfidReader)
                reader = rfidReader
                inventoryRunning.set(false)
                Log.i(TAG, "Conectado a ${device.name} / ${rfidReader.hostName} (sin override de config RF)")
                emitState(RfidReaderState.READY)
            } catch (e: RfidException) {
                emitState(RfidReaderState.ERROR)
                eventBus.emit(RfidEvent.Failure(e.error))
                throw e
            } catch (e: InvalidUsageException) {
                val error = AppError(
                    code = "RFID_INVALID_USAGE",
                    title = "Uso inválido del SDK Zebra",
                    detail = "InvalidUsageException durante connect() en ${Build.MODEL}.",
                    cause = e.info ?: e.message,
                )
                emitState(RfidReaderState.ERROR)
                eventBus.emit(RfidEvent.Failure(error))
                throw RfidException(error)
            } catch (e: Exception) {
                val error = AppError(
                    code = "RFID_CONNECT_UNEXPECTED",
                    title = "Error inesperado al conectar RFID",
                    detail = "Excepción ${e.javaClass.simpleName} durante connect() en ${Build.MODEL}.",
                    cause = e.message ?: e.toString(),
                )
                emitState(RfidReaderState.ERROR)
                eventBus.emit(RfidEvent.Failure(error))
                throw RfidException(error)
            }
        }
    }

    override suspend fun disconnect() = withContext(Dispatchers.IO) {
        mutex.withLock {
            stopLocateInternal(force = true)
            stopInventoryInternal(force = true)
            runCatching {
                eventHandler?.let { handler ->
                    reader?.Events?.removeEventsListener(handler)
                }
            }
            runCatching { reader?.disconnect() }
            runCatching { readers?.Dispose() }
            eventHandler = null
            reader = null
            readers = null
            inventoryRunning.set(false)
            locateRunning.set(false)
            clearLocateTargetFields()
            inventorySkuPrefix = null
            triggerMode = RfidTriggerMode.INVENTORY
            emitState(RfidReaderState.DISCONNECTED)
        }
    }

    override suspend fun startInventory() = withContext(Dispatchers.IO) {
        mutex.withLock {
            if (triggerMode == RfidTriggerMode.LOCATE) {
                throw failure(
                    code = "RFID_WRONG_MODE",
                    title = "Lector en modo localización",
                    detail = "Salí de localización antes de iniciar inventario masivo.",
                )
            }
            val rfidReader = reader
            if (rfidReader == null || !rfidReader.isConnected) {
                throw failure(
                    code = "RFID_NOT_CONNECTED",
                    title = "Lector RFID no conectado",
                    detail = "startInventory() requiere connect() exitoso antes de inventariar.",
                )
            }
            try {
                stopLocateInternal(force = true)
                startInventoryInternal(rfidReader)
            } catch (e: OperationFailureException) {
                throw failure(
                    code = "RFID_INVENTORY_START_FAILED",
                    title = "No se pudo iniciar el inventario RFID",
                    detail = "Actions.Inventory.perform() falló.",
                    cause = formatOpFailure(e),
                )
            } catch (e: InvalidUsageException) {
                throw failure(
                    code = "RFID_INVENTORY_INVALID_USAGE",
                    title = "Inventario RFID: uso inválido",
                    detail = "Actions.Inventory.perform() lanzó InvalidUsageException.",
                    cause = e.info ?: e.message,
                )
            }
        }
    }

    override suspend fun stopInventory() = withContext(Dispatchers.IO) {
        mutex.withLock {
            stopInventoryInternal(force = true)
            if (reader?.isConnected == true && !locateRunning.get()) {
                emitState(RfidReaderState.READY)
            }
        }
    }

    override suspend fun armSkuInventoryFilter(articuloPrefix: String) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val pattern = LocateProximity.normalizeEpc(articuloPrefix)
                    ?: throw failure(
                        code = "RFID_SKU_FILTER_EMPTY",
                        title = "Prefijo de artículo vacío",
                        detail = "armSkuInventoryFilter() requiere D1+ART (12 hex).",
                    )
                if (pattern.length != EpcScheme.ARTICULO_PREFIX_HEX_LEN) {
                    throw failure(
                        code = "RFID_SKU_FILTER_INVALID",
                        title = "Prefijo de artículo inválido",
                        detail = "Se esperaban ${EpcScheme.ARTICULO_PREFIX_HEX_LEN} hex (D1+ART), llegó ${pattern.length}.",
                    )
                }
                stopLocateInternal(force = true)
                stopInventoryInternal(force = true)
                inventorySkuPrefix = pattern
                triggerMode = RfidTriggerMode.INVENTORY
                if (reader?.isConnected == true) {
                    emitState(RfidReaderState.READY)
                }
                Log.i(TAG, "SKU inventory filter armed → $pattern")
            }
        }
    }

    override suspend fun clearSkuInventoryFilter() {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                inventorySkuPrefix = null
                val rfidReader = reader
                if (rfidReader?.isConnected == true) {
                    runCatching { rfidReader.Actions.PreFilters.deleteAll() }
                    restoreInventorySingulation(rfidReader)
                }
                Log.i(TAG, "SKU inventory filter cleared")
            }
        }
    }

    override suspend fun setTriggerMode(mode: RfidTriggerMode) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                if (mode == triggerMode) return@withLock
                stopLocateInternal(force = true)
                stopInventoryInternal(force = true)
                triggerMode = mode
                if (mode == RfidTriggerMode.INVENTORY) {
                    clearLocateTargetFields()
                }
                if (reader?.isConnected == true) {
                    emitState(RfidReaderState.READY)
                }
                Log.i(TAG, "Trigger mode → $mode")
            }
        }
    }

    override suspend fun armLocateTarget(epc: String, mode: LocateMatchMode) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val normalized = LocateProximity.normalizeEpc(epc)
                    ?: throw failure(
                        code = "RFID_LOCATE_EPC_EMPTY",
                        title = "EPC vacío para localizar",
                        detail = "armLocateTarget() requiere un EPC válido.",
                    )
                if (mode == LocateMatchMode.SERIAL &&
                    (!EpcScheme.belongsToSystem(normalized) || normalized.length != EpcScheme.EPC_HEX_LEN)
                ) {
                    throw failure(
                        code = "RFID_LOCATE_EPC_INVALID",
                        title = "EPC no es del sistema",
                        detail = "Localizar por serial requiere un EPC D1 completo (24 hex).",
                    )
                }
                val artCode = EpcScheme.decodeArticuloCode(normalized)
                    ?: throw failure(
                        code = "RFID_LOCATE_EPC_INVALID",
                        title = "EPC no es del sistema",
                        detail = "Se necesita un EPC D1… para localizar.",
                    )
                val prefix = EpcScheme.articuloPrefixHex(normalized)
                    ?: throw failure(
                        code = "RFID_LOCATE_EPC_INVALID",
                        title = "EPC no es del sistema",
                        detail = "No se pudo derivar el prefijo de artículo del EPC.",
                    )
                // Armar target + gatillo ANTES de stopInventory para que un trigger
                // durante el handoff no arranque inventario masivo.
                locateTargetEpc = normalized
                locateArticuloCode = artCode
                locatePrefix = prefix
                locateMatchMode = mode
                triggerMode = RfidTriggerMode.LOCATE
                stopInventoryInternal(force = true)
                stopLocateInternal(force = true)
                if (reader?.isConnected == true) {
                    emitState(RfidReaderState.READY)
                }
                Log.i(
                    TAG,
                    "Locate armado mode=$mode art=$artCode prefix=$prefix sample=$normalized",
                )
            }
        }
    }

    override suspend fun clearLocateTarget() {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                stopLocateInternal(force = true)
                clearLocateTargetFields()
                triggerMode = RfidTriggerMode.INVENTORY
                if (reader?.isConnected == true) {
                    emitState(RfidReaderState.READY)
                }
            }
        }
    }

    override suspend fun startLocate() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val rfidReader = reader
            if (rfidReader == null || !rfidReader.isConnected) {
                throw failure(
                    code = "RFID_NOT_CONNECTED",
                    title = "Lector RFID no conectado",
                    detail = "startLocate() requiere connect() exitoso.",
                )
            }
            val prefix = locatePrefix
            val sample = locateTargetEpc
            val mode = locateMatchMode
            val ready = when (mode) {
                LocateMatchMode.SERIAL -> !sample.isNullOrBlank()
                LocateMatchMode.SKU ->
                    !prefix.isNullOrBlank() && !sample.isNullOrBlank() && locateArticuloCode != null
            }
            if (!ready) {
                throw failure(
                    code = "RFID_LOCATE_NO_TARGET",
                    title = "Sin artículo a localizar",
                    detail = "Seleccioná un artículo o serial con etiqueta RFID antes de localizar.",
                )
            }
            try {
                stopInventoryInternal(force = true)
                startLocateInternal(rfidReader, sample!!, prefix.orEmpty(), mode)
            } catch (e: OperationFailureException) {
                throw failure(
                    code = "RFID_LOCATE_START_FAILED",
                    title = "No se pudo iniciar la localización",
                    detail = if (mode == LocateMatchMode.SERIAL) {
                        "TagLocationing / PreFilter por EPC falló."
                    } else {
                        "PreFilter por artículo falló."
                    },
                    cause = formatOpFailure(e),
                )
            } catch (e: InvalidUsageException) {
                throw failure(
                    code = "RFID_LOCATE_INVALID_USAGE",
                    title = "Localización: uso inválido",
                    detail = "PreFilter/Inventory lanzó InvalidUsageException.",
                    cause = e.info ?: e.message,
                )
            }
        }
    }

    private fun clearLocateTargetFields() {
        locateTargetEpc = null
        locateArticuloCode = null
        locatePrefix = null
        locateMatchMode = LocateMatchMode.SKU
    }

    override suspend fun stopLocate() = withContext(Dispatchers.IO) {
        mutex.withLock {
            stopLocateInternal(force = true)
            if (reader?.isConnected == true) {
                emitState(RfidReaderState.READY)
            }
        }
    }

    private fun startInventoryInternal(rfidReader: RFIDReader) {
        inventoryLock.withLock {
            if (inventoryRunning.get() || locateRunning.get()) return
            runCatching { rfidReader.Actions.Inventory.stop() }
            runCatching { rfidReader.Actions.purgeTags() }
            runCatching { rfidReader.Actions.PreFilters.deleteAll() }
            val skuPrefix = inventorySkuPrefix
            if (!skuPrefix.isNullOrBlank()) {
                // Conteo libre por SKU: mismo PreFilter Gen2 que localización.
                applyArticuloPreFilter(rfidReader, skuPrefix)
                applyLocateSingulation(rfidReader)
                Log.i(TAG, "Inventory con PreFilter SKU prefix=$skuPrefix")
            } else {
                // Inventario masivo: sin PreFilter de hardware.
                restoreInventorySingulation(rfidReader)
            }
            rfidReader.Actions.Inventory.perform()
            inventoryRunning.set(true)
            eventBus.emit(RfidEvent.StateChanged(RfidReaderState.INVENTORY_RUNNING))
        }
    }

    private fun stopInventoryInternal(force: Boolean = false) {
        inventoryLock.withLock {
            val rfidReader = reader ?: run {
                inventoryRunning.set(false)
                return
            }
            if (!force && !inventoryRunning.get()) return
            try {
                rfidReader.Actions.Inventory.stop()
            } catch (e: Exception) {
                // stop() con inventario ya detenido es frecuente al soltar el gatillo.
                Log.w(TAG, "stopInventory: ${e.javaClass.simpleName}: ${e.message}")
            } finally {
                inventoryRunning.set(false)
                if (!inventorySkuPrefix.isNullOrBlank()) {
                    runCatching { rfidReader.Actions.PreFilters.deleteAll() }
                    restoreInventorySingulation(rfidReader)
                }
                eventBus.flushPending()
            }
        }
    }

    /**
     * Localización:
     * - SKU: PreFilter Gen2 sobre `D1`+ART (48 bits) + inventario; geiger por RSSI.
     * - SERIAL: PreFilter EPC completo (96 bits) + inventario; TagLocationing solo como fallback.
     */
    private fun startLocateInternal(
        rfidReader: RFIDReader,
        sampleEpc: String,
        prefix: String,
        mode: LocateMatchMode,
    ) {
        inventoryLock.withLock {
            if (locateRunning.get()) return
            // El gatillo HANDHELD de 123RFID puede haber arrancado inventario
            // sin que inventoryRunning sea true; Perform() falla si no se para.
            runCatching { rfidReader.Actions.Inventory.stop() }
            inventoryRunning.set(false)
            runCatching { rfidReader.Actions.MultiTagLocate.stop() }
            runCatching { rfidReader.Actions.TagLocationing.Stop() }
            runCatching { rfidReader.Actions.purgeTags() }
            runCatching { rfidReader.Actions.PreFilters.deleteAll() }
            restoreSingulation(rfidReader)
            applyLocateReaderSettings(rfidReader)

            locateEngine = LOCATE_NONE
            var lastError: Exception? = null

            if (mode == LocateMatchMode.SERIAL) {
                // Preferir PreFilter-96 + Inventory (mismo geiger RSSI que SKU).
                // TagLocationing.Perform a menudo "ok" sin LocationInfo útil en MC33.
                try {
                    applyExactEpcPreFilter(rfidReader, sampleEpc)
                    applyLocateSingulation(rfidReader)
                    rfidReader.Actions.Inventory.perform()
                    inventoryRunning.set(true)
                    locateEngine = LOCATE_FILTER
                    Log.i(TAG, "Locate SERIAL PreFilter-96+Inventory OK epc=$sampleEpc")
                } catch (e: Exception) {
                    lastError = e
                    Log.w(
                        TAG,
                        "PreFilter SERIAL falló: ${e.javaClass.simpleName}: ${e.message}",
                    )
                    runCatching { rfidReader.Actions.PreFilters.deleteAll() }
                    restoreSingulation(rfidReader)
                    try {
                        rfidReader.Actions.TagLocationing.Perform(sampleEpc, null, null)
                        locateEngine = LOCATE_SINGLE
                        Log.i(TAG, "Locate SERIAL TagLocationing fallback OK epc=$sampleEpc")
                    } catch (e2: Exception) {
                        lastError = e2
                        Log.w(
                            TAG,
                            "TagLocationing SERIAL falló: ${e2.javaClass.simpleName}: ${e2.message}",
                        )
                        runCatching { rfidReader.Actions.TagLocationing.Stop() }
                    }
                }
            } else {
                val artPrefix = LocateProximity.normalizeEpc(prefix)
                    ?: EpcScheme.articuloPrefixHex(sampleEpc)
                    ?: prefix
                try {
                    applyArticuloPreFilter(rfidReader, artPrefix)
                    applyLocateSingulation(rfidReader)
                    rfidReader.Actions.Inventory.perform()
                    inventoryRunning.set(true)
                    locateEngine = LOCATE_FILTER
                    Log.i(
                        TAG,
                        "Locate SKU PreFilter+Inventory OK prefix=$artPrefix " +
                            "art=${locateArticuloCode} sample=$sampleEpc",
                    )
                } catch (e: Exception) {
                    lastError = e
                    Log.w(TAG, "PreFilter SKU locate falló: ${e.javaClass.simpleName}: ${e.message}")
                    runCatching { rfidReader.Actions.PreFilters.deleteAll() }
                    restoreSingulation(rfidReader)
                }
            }

            // Fallback soft: inventario abierto + filtro soft
            if (locateEngine == LOCATE_NONE) {
                try {
                    runCatching { rfidReader.Actions.PreFilters.deleteAll() }
                    restoreInventorySingulation(rfidReader)
                    rfidReader.Actions.Inventory.perform()
                    inventoryRunning.set(true)
                    locateEngine = LOCATE_FILTER
                    Log.i(
                        TAG,
                        "Locate soft-filter Inventory OK mode=$mode art=${locateArticuloCode}",
                    )
                } catch (e: Exception) {
                    lastError = e
                    Log.w(TAG, "Locate soft inventory falló: ${e.message}")
                }
            }

            if (locateEngine == LOCATE_NONE) {
                restoreLocateReaderSettings(rfidReader)
                throw lastError ?: IllegalStateException("No se pudo iniciar localización RFID")
            }

            locateRunning.set(true)
            eventBus.emit(RfidEvent.StateChanged(RfidReaderState.LOCATE_RUNNING))
        }
    }

    private fun stopLocateInternal(force: Boolean = false) {
        inventoryLock.withLock {
            val rfidReader = reader ?: run {
                locateRunning.set(false)
                locateEngine = LOCATE_NONE
                savedUniqueTagReport = null
                savedBeeperVolume = null
                return
            }
            if (!force && !locateRunning.get()) return
            when (locateEngine) {
                LOCATE_FILTER -> {
                    runCatching { rfidReader.Actions.Inventory.stop() }
                        .onFailure { Log.w(TAG, "Locate Inventory.stop: ${it.message}") }
                    inventoryRunning.set(false)
                    runCatching { rfidReader.Actions.PreFilters.deleteAll() }
                    restoreSingulation(rfidReader)
                }
                LOCATE_MULTI -> {
                    runCatching { rfidReader.Actions.MultiTagLocate.stop() }
                        .onFailure { Log.w(TAG, "MultiTagLocate.stop: ${it.message}") }
                    runCatching { rfidReader.Actions.MultiTagLocate.clearItems() }
                }
                LOCATE_SINGLE -> {
                    runCatching { rfidReader.Actions.TagLocationing.Stop() }
                        .onFailure { Log.w(TAG, "TagLocationing.Stop: ${it.message}") }
                }
                else -> {
                    runCatching { rfidReader.Actions.Inventory.stop() }
                    runCatching { rfidReader.Actions.MultiTagLocate.stop() }
                    runCatching { rfidReader.Actions.TagLocationing.Stop() }
                    runCatching { rfidReader.Actions.PreFilters.deleteAll() }
                    restoreSingulation(rfidReader)
                    inventoryRunning.set(false)
                }
            }
            locateRunning.set(false)
            locateEngine = LOCATE_NONE
            restoreLocateReaderSettings(rfidReader)
        }
    }

    /**
     * TagLocationing necesita reportes repetidos del mismo EPC (geiger).
     * UniqueTagReport=ENABLE (típico 123RFID) entrega un solo evento con
     * relativeDistance=0 y el localizador parece muerto.
     */
    private fun applyLocateReaderSettings(rfidReader: RFIDReader) {
        if (savedUniqueTagReport == null) {
            savedUniqueTagReport = runCatching { rfidReader.Config.uniqueTagReport }.getOrNull()
        }
        runCatching { rfidReader.Config.setUniqueTagReport(false) }
            .onFailure { Log.w(TAG, "setUniqueTagReport(false): ${it.message}") }
        if (savedBeeperVolume == null) {
            savedBeeperVolume = runCatching { rfidReader.Config.beeperVolume }.getOrNull()
        }
        runCatching { rfidReader.Config.setBeeperVolume(BEEPER_VOLUME.HIGH_BEEP) }
            .onFailure { Log.w(TAG, "setBeeperVolume(HIGH): ${it.message}") }
    }

    private fun restoreLocateReaderSettings(rfidReader: RFIDReader) {
        savedUniqueTagReport?.let { previous ->
            runCatching {
                rfidReader.Config.setUniqueTagReport(
                    previous == UNIQUE_TAG_REPORT_SETTING.ENABLE,
                )
            }.onFailure { Log.w(TAG, "restore UniqueTagReport: ${it.message}") }
        }
        savedUniqueTagReport = null
        savedBeeperVolume?.let { previous ->
            runCatching { rfidReader.Config.setBeeperVolume(previous) }
                .onFailure { Log.w(TAG, "restore BeeperVolume: ${it.message}") }
        }
        savedBeeperVolume = null
    }

    /**
     * PreFilter Gen2 por prefijo de artículo: `D1` + ART (12 hex = 48 bits).
     * bitOffset 32 = CRC+PC antes del EPC en memoria Gen2.
     */
    private fun applyArticuloPreFilter(rfidReader: RFIDReader, locatePrefix: String) {
        val pattern = LocateProximity.normalizeEpc(locatePrefix)
            ?: throw IllegalArgumentException("locatePrefix vacío")
        require(pattern.length == EpcScheme.ARTICULO_PREFIX_HEX_LEN) {
            "locatePrefix debe tener ${EpcScheme.ARTICULO_PREFIX_HEX_LEN} hex (D1+ART)"
        }
        val filters = PreFilters()
        val filter = filters.PreFilter()
        filter.setAntennaID(1.toShort())
        filter.setTagPattern(pattern)
        filter.setTagPatternBitCount(pattern.length * 4)
        filter.setBitOffset(32)
        filter.setMemoryBank(MEMORY_BANK.MEMORY_BANK_EPC)
        filter.setFilterAction(FILTER_ACTION.FILTER_ACTION_STATE_AWARE)
        filter.StateAwareAction.setTarget(TARGET.TARGET_SL)
        filter.StateAwareAction.setStateAwareAction(
            STATE_AWARE_ACTION.STATE_AWARE_ACTION_ASRT_SL_NOT_DSRT_SL,
        )
        filter.setTruncateAction(TRUNCATE_ACTION.TRUNCATE_ACTION_DO_NOT_TRUNCATE)
        rfidReader.Actions.PreFilters.add(filter)
        Log.i(TAG, "PreFilter ART prefix=$pattern bitCount=${pattern.length * 4} offset=32")
    }

    /**
     * PreFilter Gen2 por EPC completo (24 hex = 96 bits) para localización SERIAL.
     */
    private fun applyExactEpcPreFilter(rfidReader: RFIDReader, fullEpc: String) {
        val pattern = LocateProximity.normalizeEpc(fullEpc)
            ?: throw IllegalArgumentException("EPC vacío")
        require(pattern.length == EpcScheme.EPC_HEX_LEN) {
            "EPC debe tener ${EpcScheme.EPC_HEX_LEN} hex para PreFilter SERIAL"
        }
        val filters = PreFilters()
        val filter = filters.PreFilter()
        filter.setAntennaID(1.toShort())
        filter.setTagPattern(pattern)
        filter.setTagPatternBitCount(pattern.length * 4)
        filter.setBitOffset(32)
        filter.setMemoryBank(MEMORY_BANK.MEMORY_BANK_EPC)
        filter.setFilterAction(FILTER_ACTION.FILTER_ACTION_STATE_AWARE)
        filter.StateAwareAction.setTarget(TARGET.TARGET_SL)
        filter.StateAwareAction.setStateAwareAction(
            STATE_AWARE_ACTION.STATE_AWARE_ACTION_ASRT_SL_NOT_DSRT_SL,
        )
        filter.setTruncateAction(TRUNCATE_ACTION.TRUNCATE_ACTION_DO_NOT_TRUNCATE)
        rfidReader.Actions.PreFilters.add(filter)
        Log.i(TAG, "PreFilter SERIAL epc=$pattern bitCount=${pattern.length * 4} offset=32")
    }

    /**
     * PreFilter por sufijo de sistema — NO usar en inventario masivo por ahora:
     * requiere singulación SL alineada y el offset es sensible al modelo.
     * Se conserva para pruebas futuras.
     */
    @Suppress("unused")
    private fun applySystemSuffixPreFilter(rfidReader: RFIDReader) {
        val suffix = EpcScheme.SYSTEM_SUFFIX
        val filters = PreFilters()
        val filter = filters.PreFilter()
        filter.setAntennaID(1.toShort())
        filter.setTagPattern(suffix)
        filter.setTagPatternBitCount(suffix.length * 4)
        filter.setBitOffset(32 + 88)
        filter.setMemoryBank(MEMORY_BANK.MEMORY_BANK_EPC)
        filter.setFilterAction(FILTER_ACTION.FILTER_ACTION_STATE_AWARE)
        filter.StateAwareAction.setTarget(TARGET.TARGET_SL)
        filter.StateAwareAction.setStateAwareAction(
            STATE_AWARE_ACTION.STATE_AWARE_ACTION_ASRT_SL_NOT_DSRT_SL,
        )
        filter.setTruncateAction(TRUNCATE_ACTION.TRUNCATE_ACTION_DO_NOT_TRUNCATE)
        rfidReader.Actions.PreFilters.add(filter)
        Log.i(
            TAG,
            "PreFilter sistema suffix=$suffix bitCount=${suffix.length * 4} offset=${32 + 88}",
        )
    }

    /** Tras localizar, dejar singulación abierta para inventario normal. */
    private fun restoreInventorySingulation(rfidReader: RFIDReader) {
        try {
            val control = rfidReader.Config.Antennas.getSingulationControl(1)
            control.Action.setSLFlag(SL_FLAG.SL_ALL)
            control.Action.setPerformStateAwareSingulationAction(false)
            rfidReader.Config.Antennas.setSingulationControl(1, control)
            savedSlFlag = null
            Log.i(TAG, "Singulation inventario: SL_ALL")
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo restaurar singulation inventario: ${e.message}")
        }
    }

    private fun applyLocateSingulation(rfidReader: RFIDReader) {
        try {
            val control = rfidReader.Config.Antennas.getSingulationControl(1)
            savedSlFlag = control.Action.slFlag
            control.Action.setSLFlag(SL_FLAG.SL_FLAG_ASSERTED)
            control.Action.setPerformStateAwareSingulationAction(true)
            rfidReader.Config.Antennas.setSingulationControl(1, control)
            Log.i(TAG, "Singulation locate: SL_FLAG_ASSERTED (prev=$savedSlFlag)")
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo setear singulation SL asserted: ${e.message}")
        }
    }

    private fun restoreSingulation(rfidReader: RFIDReader) {
        val previous = savedSlFlag ?: SL_FLAG.SL_ALL
        savedSlFlag = null
        try {
            val control = rfidReader.Config.Antennas.getSingulationControl(1)
            control.Action.setSLFlag(previous)
            rfidReader.Config.Antennas.setSingulationControl(1, control)
            Log.i(TAG, "Singulation restaurada: $previous")
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo restaurar singulation: ${e.message}")
        }
    }

    private fun queueStartInventory() {
        inventoryExecutor.execute {
            try {
                val rfidReader = reader ?: return@execute
                if (!rfidReader.isConnected) return@execute
                startInventoryInternal(rfidReader)
            } catch (e: Exception) {
                Log.e(TAG, "queueStartInventory: ${e.message}", e)
            }
        }
    }

    private fun queueStopInventory() {
        inventoryExecutor.execute {
            try {
                stopInventoryInternal(force = true)
                if (reader?.isConnected == true && !locateRunning.get()) {
                    eventBus.emit(RfidEvent.StateChanged(RfidReaderState.READY))
                }
            } catch (e: Exception) {
                Log.e(TAG, "queueStopInventory: ${e.message}", e)
            }
        }
    }

    private fun queueStartLocate() {
        inventoryExecutor.execute {
            try {
                val rfidReader = reader ?: return@execute
                if (!rfidReader.isConnected) return@execute
                val sample = locateTargetEpc ?: return@execute
                val mode = locateMatchMode
                if (mode == LocateMatchMode.SKU && locatePrefix.isNullOrBlank()) return@execute
                startLocateInternal(rfidReader, sample, locatePrefix.orEmpty(), mode)
            } catch (e: Exception) {
                Log.e(TAG, "queueStartLocate: ${e.message}", e)
                eventBus.emit(
                    RfidEvent.Failure(
                        AppError(
                            code = "RFID_LOCATE_START_FAILED",
                            title = "No se pudo iniciar localización",
                            detail = "No se pudo iniciar localización (PreFilter/Inventory).",
                            cause = e.message,
                        ),
                    ),
                )
            }
        }
    }

    private fun queueStopLocate() {
        inventoryExecutor.execute {
            try {
                stopLocateInternal(force = true)
                if (reader?.isConnected == true) {
                    eventBus.emit(RfidEvent.StateChanged(RfidReaderState.READY))
                }
            } catch (e: Exception) {
                Log.e(TAG, "queueStopLocate: ${e.message}", e)
            }
        }
    }

    private fun connectWithRecovery(rfidReader: RFIDReader, deviceName: String) {
        try {
            if (!rfidReader.isConnected) {
                rfidReader.connect()
            }
            return
        } catch (e: OperationFailureException) {
            Log.w(TAG, "connect fallo: ${formatOpFailure(e)}")
            when (e.results) {
                RFIDResults.RFID_READER_REGION_NOT_CONFIGURED -> {
                    configureRegion(rfidReader)
                    retryConnect(rfidReader, deviceName, e, afterRegion = true)
                }
                RFIDResults.RFID_COMM_CONNECTION_ALREADY_EXISTS,
                RFIDResults.RFID_API_LOCK_ACQUIRE_FAILURE,
                -> {
                    runCatching { rfidReader.disconnect() }
                    try {
                        rfidReader.connect()
                    } catch (retry: OperationFailureException) {
                        if (retry.results == RFIDResults.RFID_READER_REGION_NOT_CONFIGURED) {
                            configureRegion(rfidReader)
                            retryConnect(rfidReader, deviceName, retry, afterRegion = true)
                        } else {
                            throw mapConnectFailure(deviceName, retry, locked = true)
                        }
                    }
                }
                else -> {
                    if (isRegionNotConfigured(e)) {
                        configureRegion(rfidReader)
                        retryConnect(rfidReader, deviceName, e, afterRegion = true)
                    } else {
                        throw mapConnectFailure(deviceName, e, locked = false)
                    }
                }
            }
        }
    }

    private fun retryConnect(
        rfidReader: RFIDReader,
        deviceName: String,
        original: OperationFailureException,
        afterRegion: Boolean,
    ) {
        try {
            if (!rfidReader.isConnected) {
                rfidReader.connect()
            }
        } catch (e: OperationFailureException) {
            throw mapConnectFailure(deviceName, e, locked = false, afterRegion = afterRegion, previous = original)
        }
    }

    private fun mapConnectFailure(
        deviceName: String,
        e: OperationFailureException,
        locked: Boolean,
        afterRegion: Boolean = false,
        previous: OperationFailureException? = null,
    ): RfidException {
        val results = e.results?.toString().orEmpty()
        val lockedHint = locked ||
            results.contains("LOCK", ignoreCase = true) ||
            results.contains("ALREADY_EXISTS", ignoreCase = true)

        val title = when {
            afterRegion -> "Región RFID configurada, pero reconnect falló"
            lockedHint -> "Lector RFID ocupado por otra app"
            else -> "Fallo al conectar el lector RFID"
        }
        val detail = buildString {
            append("OperationFailureException al conectar '$deviceName' (${Build.MODEL}).")
            if (lockedHint) {
                append(" Cerrá completamente 123RFID / RFID Demo / RFID Manager y tocá Reconectar.")
            }
            if (afterRegion) {
                append(" Se intentó setRegulatoryConfig y un segundo connect().")
            }
        }
        val cause = buildString {
            append(formatOpFailure(e))
            previous?.let { append(" | previo: ${formatOpFailure(it)}") }
        }
        return failure(
            code = if (lockedHint) "RFID_READER_BUSY" else "RFID_CONNECT_OPERATION_FAILED",
            title = title,
            detail = detail,
            cause = cause,
        )
    }

    private fun isRegionNotConfigured(e: OperationFailureException): Boolean {
        if (e.results == RFIDResults.RFID_READER_REGION_NOT_CONFIGURED) return true
        val blob = listOfNotNull(e.results?.toString(), e.vendorMessage, e.statusDescription)
            .joinToString(" ")
        return blob.contains("REGION_NOT_CONFIGURED", ignoreCase = true) ||
            blob.contains("REGION NOT CONFIGURED", ignoreCase = true)
    }

    private fun formatOpFailure(e: OperationFailureException): String {
        return "results=${e.results} | vendor=${e.vendorMessage} | status=${e.statusDescription}"
    }

    private fun discoverReaders(): List<ReaderDevice> {
        val transports = listOf(
            ENUM_TRANSPORT.SERVICE_SERIAL,
            ENUM_TRANSPORT.QC_SERIAL,
            ENUM_TRANSPORT.SERVICE_USB,
            ENUM_TRANSPORT.BLUETOOTH,
        )

        var instance = readers
        if (instance == null) {
            instance = Readers(appContext, transports.first())
            readers = instance
        }

        for (transport in transports) {
            try {
                instance!!.setTransport(transport)
                val list = instance.GetAvailableRFIDReaderList()
                Log.i(TAG, "Transporte $transport → ${list?.size ?: 0} readers")
                if (!list.isNullOrEmpty()) {
                    return list
                }
            } catch (e: InvalidUsageException) {
                Log.w(TAG, "Transporte $transport inválido: ${e.info}")
            }
        }
        return emptyList()
    }

    private fun configureRegion(rfidReader: RFIDReader) {
        try {
            val regCfg = rfidReader.Config.regulatoryConfig
                ?: throw IllegalStateException("regulatoryConfig null")
            val regions = rfidReader.ReaderCapabilities.SupportedRegions
            val regionInfo = pickPreferredRegion(regions)
                ?: throw IllegalStateException("SupportedRegions vacío")

            regCfg.setRegion(regionInfo.regionCode)
            regCfg.setIsHoppingOn(regionInfo.isHoppingConfigurable)
            regCfg.setEnabledChannels(regionInfo.supportedChannels)
            regCfg.setStandardName(regionInfo.name)
            rfidReader.Config.regulatoryConfig = regCfg
            Log.i(
                TAG,
                "Región RFID configurada (solo por REGION_NOT_CONFIGURED): " +
                    "name=${regionInfo.name} code=${regionInfo.regionCode}",
            )
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo auto-configurar región: ${e.message}", e)
            throw failure(
                code = "RFID_REGION_CONFIG_FAILED",
                title = "No se pudo configurar la región RFID",
                detail = "El lector exige región regulatoria. Configurala en 123RFID y reintentá.",
                cause = e.message ?: e.toString(),
            )
        }
    }

    private fun pickPreferredRegion(regions: com.zebra.rfid.api3.SupportedRegions): RegionInfo? {
        if (regions.length() <= 0) return null
        val preferred = listOf("AR", "ARGENTINA", "FCC", "USA", "NA", "ETSI", "EU")
        for (pref in preferred) {
            for (i in 0 until regions.length()) {
                val info = regions.getRegionInfo(i) ?: continue
                val name = info.name.orEmpty()
                val code = info.regionCode.orEmpty()
                if (name.contains(pref, ignoreCase = true) || code.equals(pref, ignoreCase = true)) {
                    return info
                }
            }
        }
        return regions.getRegionInfo(0)
    }

    /** Solo eventos: no modifica potencia, sesión, prefilters ni triggers del reader. */
    private fun attachEventsOnly(rfidReader: RFIDReader) {
        val handler = eventHandler ?: EventHandler().also { eventHandler = it }
        runCatching { rfidReader.Events.removeEventsListener(handler) }
        rfidReader.Events.addEventsListener(handler)
        rfidReader.Events.setHandheldEvent(true)
        rfidReader.Events.setTagReadEvent(true)
        rfidReader.Events.setAttachTagDataWithReadEvent(false)
        rfidReader.Events.setReaderDisconnectEvent(true)
        Log.i(TAG, "Eventos RFID suscritos; se conserva la config del reader (123RFID)")
    }

    private fun emitState(state: RfidReaderState) {
        eventBus.emit(RfidEvent.StateChanged(state))
    }

    private fun failure(
        code: String,
        title: String,
        detail: String,
        cause: String? = null,
    ): RfidException {
        return RfidException(
            AppError(
                code = code,
                title = title,
                detail = detail,
                cause = cause,
            ),
        )
    }

    private inner class EventHandler : RfidEventsListener {
        override fun eventReadNotify(e: RfidReadEvents?) {
            val rfidReader = reader ?: return
            try {
                if (locateRunning.get()) {
                    emitLocateUpdates(rfidReader)
                    return
                }
                if (!inventoryRunning.get()) return
                val tags = rfidReader.Actions.getReadTags(100) ?: return
                val mapped = tags.mapNotNull { tag ->
                    val epc = tag.tagID ?: return@mapNotNull null
                    if (epc.isBlank()) return@mapNotNull null
                    // Soft-filter: solo esquema Don Nicolás (prefijo D1)
                    if (!EpcScheme.belongsToSystem(epc)) {
                        Log.i(TAG, "Ignorar tag ajeno: $epc")
                        return@mapNotNull null
                    }
                    RfidTag(
                        epc = EpcScheme.normalize(epc),
                        rssi = runCatching { tag.peakRSSI.toInt() }.getOrDefault(0),
                        antenna = runCatching { tag.antennaID.toInt() }.getOrDefault(0),
                        seenCount = 1,
                    )
                }
                if (mapped.isNotEmpty()) {
                    eventBus.emit(RfidEvent.BatchRead(mapped))
                }
            } catch (ex: Exception) {
                Log.e(TAG, "eventReadNotify: ${ex.message}", ex)
            }
        }

        override fun eventStatusNotify(e: RfidStatusEvents?) {
            try {
                val statusType = e?.StatusEventData?.statusEventType ?: return
                when (statusType) {
                    STATUS_EVENT_TYPE.HANDHELD_TRIGGER_EVENT -> {
                        val trigger = e.StatusEventData.HandheldTriggerEventData.handheldEvent
                        when (trigger) {
                            HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_PRESSED -> {
                                when (triggerMode) {
                                    RfidTriggerMode.LOCATE -> {
                                        Log.i(TAG, "Trigger PRESSED → locate ($locateTargetEpc)")
                                        queueStartLocate()
                                    }
                                    RfidTriggerMode.INVENTORY -> {
                                        Log.i(TAG, "Trigger PRESSED → inventory")
                                        queueStartInventory()
                                    }
                                }
                            }
                            HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED -> {
                                when (triggerMode) {
                                    RfidTriggerMode.LOCATE -> {
                                        Log.i(TAG, "Trigger RELEASED → stop locate")
                                        queueStopLocate()
                                    }
                                    RfidTriggerMode.INVENTORY -> {
                                        Log.i(TAG, "Trigger RELEASED → stop inventory")
                                        queueStopInventory()
                                    }
                                }
                            }
                            else -> Unit
                        }
                    }
                    STATUS_EVENT_TYPE.DISCONNECTION_EVENT -> {
                        inventoryRunning.set(false)
                        locateRunning.set(false)
                        locateEngine = LOCATE_NONE
                        eventBus.emit(
                            RfidEvent.Failure(
                                AppError(
                                    code = "RFID_DISCONNECTED",
                                    title = "Lector RFID desconectado",
                                    detail = "El SDK reportó DISCONNECTION_EVENT. Reconectá desde la app.",
                                ),
                            ),
                        )
                        eventBus.emit(RfidEvent.StateChanged(RfidReaderState.DISCONNECTED))
                    }
                    else -> Log.d(TAG, "Status event: $statusType")
                }
            } catch (ex: Exception) {
                Log.e(TAG, "eventStatusNotify: ${ex.message}", ex)
            }
        }
    }

    private fun emitLocateUpdates(rfidReader: RFIDReader) {
        val artCode = locateArticuloCode
        val prefix = locatePrefix
        val sample = locateTargetEpc
        val mode = locateMatchMode
        val seen = LinkedHashMap<String, Pair<Int, Int>>() // epc -> (distance, rssi)

        fun consider(epcRaw: String?, distance: Int?, rssi: Int?, source: String) {
            val epc = LocateProximity.normalizeEpc(epcRaw) ?: return
            val matches = when (mode) {
                LocateMatchMode.SERIAL -> LocateProximity.epcMatches(sample, epc)
                LocateMatchMode.SKU -> when {
                    artCode != null -> LocateProximity.articuloMatches(artCode, epc)
                    !prefix.isNullOrBlank() -> LocateProximity.articuloMatchesPrefix(prefix, epc)
                    else -> false
                }
            }
            if (!matches) {
                Log.d(TAG, "Locate ignore $epc (mode=$mode art=$artCode) via $source")
                return
            }
            val dist = LocateProximity.resolve(distance, rssi)
            if (dist <= 0 && (rssi == null || LocateProximity.fromRssi(rssi) <= 0)) {
                return
            }
            val rssiVal = rssi?.let { LocateProximity.signedRssi(it) } ?: 0
            val prev = seen[epc]
            if (prev == null || dist >= prev.first) {
                seen[epc] = dist to rssiVal
            }
            Log.i(TAG, "Locate hit epc=$epc dist=$dist rssi=$rssiVal src=$source engine=$locateEngine")
        }

        runCatching {
            rfidReader.Actions.getReadTags(100)
        }.getOrNull()?.forEach { tag ->
            val epc = tag.tagID
            val rssi = runCatching { tag.peakRSSI.toInt() }.getOrNull()
            when {
                tag.isContainsLocationInfo -> {
                    val dist = runCatching {
                        tag.LocationInfo.relativeDistance.toInt()
                    }.getOrNull()
                    consider(epc, dist, rssi, "LocationInfo")
                }
                tag.isContainsMultiTagLocateInfo -> {
                    val dist = runCatching {
                        tag.MultiTagLocateInfo.relativeDistance.toInt()
                    }.getOrNull()
                    consider(epc, dist, rssi, "LocationInfo-multi")
                }
                else -> consider(epc, null, rssi, "ReadTags-rssi")
            }
        }

        // Una sola actualización UI: la unidad más cercana del SKU en este batch.
        // Peak-hold entre batches (no pisar con lecturas más débiles) vive en AssetSearchViewModel.
        val best = seen.maxByOrNull { it.value.first } ?: return
        eventBus.emit(
            RfidEvent.LocateUpdate(
                epc = best.key,
                relativeDistance = best.value.first,
                rssi = best.value.second,
            ),
        )
    }

    companion object {
        private const val TAG = "ZebraRfidReader"
        private const val LOCATE_NONE = "none"
        private const val LOCATE_FILTER = "filter"
        private const val LOCATE_MULTI = "multi"
        private const val LOCATE_SINGLE = "single"
    }
}

class RfidException(val error: AppError) : Exception(error.displayMessage())
