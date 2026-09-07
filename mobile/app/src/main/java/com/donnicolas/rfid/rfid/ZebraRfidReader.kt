package com.donnicolas.rfid.rfid

import android.content.Context
import android.os.Build
import android.util.Log
import com.donnicolas.rfid.data.model.AppError
import com.zebra.rfid.api3.ENUM_TRANSPORT
import com.zebra.rfid.api3.HANDHELD_TRIGGER_EVENT_TYPE
import com.zebra.rfid.api3.InvalidUsageException
import com.zebra.rfid.api3.OperationFailureException
import com.zebra.rfid.api3.RFIDReader
import com.zebra.rfid.api3.RFIDResults
import com.zebra.rfid.api3.ReaderDevice
import com.zebra.rfid.api3.Readers
import com.zebra.rfid.api3.RegionInfo
import com.zebra.rfid.api3.RfidEventsListener
import com.zebra.rfid.api3.RfidReadEvents
import com.zebra.rfid.api3.RfidStatusEvents
import com.zebra.rfid.api3.STATUS_EVENT_TYPE
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Adaptador Zebra RFID API3 para handheld MC33xx.
 *
 * No pisa potencia/sesión/triggers de config RF: respeta 123RFID.
 * El gatillo puede disparar inventario o TagLocationing según [RfidTriggerMode].
 */
class ZebraRfidReader(
    context: Context,
) : RfidReader {
    override val modeName: String = "ZEBRA"

    private val appContext = context.applicationContext
    private val eventsFlow = MutableSharedFlow<RfidEvent>(extraBufferCapacity = 512)
    private val mutex = Mutex()
    private val inventoryLock = ReentrantLock()
    private val inventoryRunning = AtomicBoolean(false)
    private val locateRunning = AtomicBoolean(false)
    @Volatile private var triggerMode: RfidTriggerMode = RfidTriggerMode.INVENTORY
    @Volatile private var locateTargetEpc: String? = null
    /** multi = MultiTagLocate (123RFID); single = TagLocationing.Perform */
    @Volatile private var locateEngine: String = LOCATE_NONE
    private val inventoryExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { r ->
            Thread(r, "zebra-rfid-inventory").apply { isDaemon = true }
        }

    private var readers: Readers? = null
    private var reader: RFIDReader? = null
    private var eventHandler: EventHandler? = null

    override fun events(): Flow<RfidEvent> = eventsFlow.asSharedFlow()

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
                eventsFlow.tryEmit(RfidEvent.Failure(e.error))
                throw e
            } catch (e: InvalidUsageException) {
                val error = AppError(
                    code = "RFID_INVALID_USAGE",
                    title = "Uso inválido del SDK Zebra",
                    detail = "InvalidUsageException durante connect() en ${Build.MODEL}.",
                    cause = e.info ?: e.message,
                )
                emitState(RfidReaderState.ERROR)
                eventsFlow.tryEmit(RfidEvent.Failure(error))
                throw RfidException(error)
            } catch (e: Exception) {
                val error = AppError(
                    code = "RFID_CONNECT_UNEXPECTED",
                    title = "Error inesperado al conectar RFID",
                    detail = "Excepción ${e.javaClass.simpleName} durante connect() en ${Build.MODEL}.",
                    cause = e.message ?: e.toString(),
                )
                emitState(RfidReaderState.ERROR)
                eventsFlow.tryEmit(RfidEvent.Failure(error))
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
            locateTargetEpc = null
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

    override suspend fun setTriggerMode(mode: RfidTriggerMode) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                if (mode == triggerMode) return@withLock
                stopLocateInternal(force = true)
                stopInventoryInternal(force = true)
                triggerMode = mode
                if (mode == RfidTriggerMode.INVENTORY) {
                    locateTargetEpc = null
                }
                if (reader?.isConnected == true) {
                    emitState(RfidReaderState.READY)
                }
                Log.i(TAG, "Trigger mode → $mode")
            }
        }
    }

    override suspend fun armLocateTarget(epc: String) {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                val normalized = LocateProximity.normalizeEpc(epc)
                    ?: throw failure(
                        code = "RFID_LOCATE_EPC_EMPTY",
                        title = "EPC vacío para localizar",
                        detail = "armLocateTarget() requiere un EPC válido.",
                    )
                stopInventoryInternal(force = true)
                stopLocateInternal(force = true)
                locateTargetEpc = normalized
                triggerMode = RfidTriggerMode.LOCATE
                if (reader?.isConnected == true) {
                    emitState(RfidReaderState.READY)
                }
                Log.i(TAG, "Locate target armado: $normalized")
            }
        }
    }

    override suspend fun clearLocateTarget() {
        withContext(Dispatchers.IO) {
            mutex.withLock {
                stopLocateInternal(force = true)
                locateTargetEpc = null
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
            val epc = locateTargetEpc
                ?: throw failure(
                    code = "RFID_LOCATE_NO_TARGET",
                    title = "Sin etiqueta a localizar",
                    detail = "Seleccioná un activo con EPC antes de localizar.",
                )
            try {
                stopInventoryInternal(force = true)
                startLocateInternal(rfidReader, epc)
            } catch (e: OperationFailureException) {
                throw failure(
                    code = "RFID_LOCATE_START_FAILED",
                    title = "No se pudo iniciar la localización",
                    detail = "TagLocationing.Perform() falló.",
                    cause = formatOpFailure(e),
                )
            } catch (e: InvalidUsageException) {
                throw failure(
                    code = "RFID_LOCATE_INVALID_USAGE",
                    title = "Localización: uso inválido",
                    detail = "TagLocationing.Perform() lanzó InvalidUsageException.",
                    cause = e.info ?: e.message,
                )
            }
        }
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
            rfidReader.Actions.Inventory.perform()
            inventoryRunning.set(true)
            eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.INVENTORY_RUNNING))
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
            }
        }
    }

    private fun startLocateInternal(rfidReader: RFIDReader, epc: String) {
        inventoryLock.withLock {
            if (locateRunning.get()) return
            if (inventoryRunning.get()) {
                runCatching { rfidReader.Actions.Inventory.stop() }
                inventoryRunning.set(false)
            }

            // PreFilters residuales (p. ej. de 123RFID) bloquean el geiger.
            runCatching { rfidReader.Actions.PreFilters.deleteAll() }
            runCatching { rfidReader.Actions.purgeTags() }

            val supported = runCatching {
                rfidReader.ReaderCapabilities.isTagLocationingSupported
            }.getOrDefault(true)
            Log.i(TAG, "Locate start epc=$epc supported=$supported")

            locateEngine = LOCATE_NONE
            var lastError: Exception? = null

            // 1) MultiTagLocate — mismo camino que 123RFID Locate
            try {
                runCatching { rfidReader.Actions.MultiTagLocate.stop() }
                runCatching { rfidReader.Actions.MultiTagLocate.clearItems() }
                runCatching { rfidReader.Actions.MultiTagLocate.purgeItemList() }
                val added = rfidReader.Actions.MultiTagLocate.addItem(epc, REF_RSSI)
                Log.i(TAG, "MultiTagLocate.addItem($epc, $REF_RSSI) → $added")
                rfidReader.Actions.MultiTagLocate.perform()
                locateEngine = LOCATE_MULTI
                Log.i(TAG, "MultiTagLocate.perform OK")
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "MultiTagLocate falló: ${e.javaClass.simpleName}: ${e.message}")
            }

            // 2) Fallback TagLocationing.Perform (API clásica)
            if (locateEngine == LOCATE_NONE) {
                try {
                    runCatching { rfidReader.Actions.TagLocationing.Stop() }
                    rfidReader.Actions.TagLocationing.Perform(epc, null, null)
                    locateEngine = LOCATE_SINGLE
                    Log.i(TAG, "TagLocationing.Perform($epc) OK")
                } catch (e: Exception) {
                    lastError = e
                    Log.e(TAG, "TagLocationing.Perform falló: ${e.message}", e)
                }
            }

            if (locateEngine == LOCATE_NONE) {
                throw lastError ?: IllegalStateException("No se pudo iniciar localización RFID")
            }

            locateRunning.set(true)
            eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.LOCATE_RUNNING))
        }
    }

    private fun stopLocateInternal(force: Boolean = false) {
        inventoryLock.withLock {
            val rfidReader = reader ?: run {
                locateRunning.set(false)
                locateEngine = LOCATE_NONE
                return
            }
            if (!force && !locateRunning.get()) return
            when (locateEngine) {
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
                    runCatching { rfidReader.Actions.MultiTagLocate.stop() }
                    runCatching { rfidReader.Actions.TagLocationing.Stop() }
                }
            }
            locateRunning.set(false)
            locateEngine = LOCATE_NONE
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
                    eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.READY))
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
                val epc = locateTargetEpc ?: return@execute
                startLocateInternal(rfidReader, epc)
            } catch (e: Exception) {
                Log.e(TAG, "queueStartLocate: ${e.message}", e)
                eventsFlow.tryEmit(
                    RfidEvent.Failure(
                        AppError(
                            code = "RFID_LOCATE_START_FAILED",
                            title = "No se pudo iniciar localización",
                            detail = "TagLocationing.Perform() falló desde el gatillo.",
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
                    eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.READY))
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

    private suspend fun emitState(state: RfidReaderState) {
        eventsFlow.emit(RfidEvent.StateChanged(state))
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
                    RfidTag(
                        epc = epc,
                        rssi = runCatching { tag.peakRSSI.toInt() }.getOrDefault(0),
                        antenna = runCatching { tag.antennaID.toInt() }.getOrDefault(0),
                        seenCount = 1,
                    )
                }
                if (mapped.isNotEmpty()) {
                    eventsFlow.tryEmit(RfidEvent.BatchRead(mapped))
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
                        eventsFlow.tryEmit(
                            RfidEvent.Failure(
                                AppError(
                                    code = "RFID_DISCONNECTED",
                                    title = "Lector RFID desconectado",
                                    detail = "El SDK reportó DISCONNECTION_EVENT. Reconectá desde la app.",
                                ),
                            ),
                        )
                        eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.DISCONNECTED))
                    }
                    else -> Log.d(TAG, "Status event: $statusType")
                }
            } catch (ex: Exception) {
                Log.e(TAG, "eventStatusNotify: ${ex.message}", ex)
            }
        }
    }

    private fun emitLocateUpdates(rfidReader: RFIDReader) {
        val target = locateTargetEpc
        val seen = LinkedHashMap<String, Pair<Int, Int>>() // epc -> (distance, rssi)

        fun consider(epcRaw: String?, distance: Int?, rssi: Int?, source: String) {
            val epc = LocateProximity.normalizeEpc(epcRaw) ?: return
            if (target != null && !LocateProximity.epcMatches(target, epc)) {
                Log.d(TAG, "Locate ignore $epc (target=$target) via $source")
                return
            }
            val dist = when {
                distance != null && rssi != null ->
                    maxOf(LocateProximity.clamp(distance), LocateProximity.fromRssi(rssi))
                distance != null -> LocateProximity.clamp(distance)
                rssi != null -> LocateProximity.fromRssi(rssi)
                else -> return
            }
            val rssiVal = rssi ?: 0
            val prev = seen[epc]
            if (prev == null || dist >= prev.first) {
                seen[epc] = dist to rssiVal
            }
            Log.i(TAG, "Locate hit epc=$epc dist=$dist rssi=$rssiVal src=$source engine=$locateEngine")
        }

        // MultiTagLocate: leer por API dedicada (como 123RFID)
        runCatching {
            rfidReader.Actions.getMultiTagLocateTagInfo(100)
        }.getOrNull()?.forEach { tag ->
            val epc = tag.tagID
            val rssi = runCatching { tag.peakRSSI.toInt() }.getOrNull()
            if (tag.isContainsMultiTagLocateInfo) {
                val dist = runCatching {
                    tag.MultiTagLocateInfo.relativeDistance.toInt()
                }.getOrNull()
                consider(epc, dist, rssi, "MultiTagLocateInfo")
            } else {
                consider(epc, null, rssi, "MultiTagLocateTagInfo-rssi")
            }
        }

        // TagLocationing clásico + cualquier lectura con LocationInfo
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

        seen.forEach { (epc, pair) ->
            eventsFlow.tryEmit(
                RfidEvent.LocateUpdate(
                    epc = epc,
                    relativeDistance = pair.first,
                    rssi = pair.second,
                ),
            )
        }
    }

    companion object {
        private const val TAG = "ZebraRfidReader"
        private const val LOCATE_NONE = "none"
        private const val LOCATE_MULTI = "multi"
        private const val LOCATE_SINGLE = "single"
        /** RSSI de referencia típico para MultiTagLocate (docs Zebra / 123RFID). */
        private const val REF_RSSI = "-50"
    }
}

class RfidException(val error: AppError) : Exception(error.displayMessage())
