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
 * No pisa potencia/sesión/triggers: respeta la configuración aplicada
 * previamente (p. ej. desde 123RFID). Solo conecta, escucha eventos y
 * arranca/detiene inventario.
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
            emitState(RfidReaderState.DISCONNECTED)
        }
    }

    override suspend fun startInventory() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val rfidReader = reader
            if (rfidReader == null || !rfidReader.isConnected) {
                throw failure(
                    code = "RFID_NOT_CONNECTED",
                    title = "Lector RFID no conectado",
                    detail = "startInventory() requiere connect() exitoso antes de inventariar.",
                )
            }
            try {
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
            if (reader?.isConnected == true) {
                emitState(RfidReaderState.READY)
            }
        }
    }

    private fun startInventoryInternal(rfidReader: RFIDReader) {
        inventoryLock.withLock {
            if (inventoryRunning.get()) return
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
                if (reader?.isConnected == true) {
                    eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.READY))
                }
            } catch (e: Exception) {
                Log.e(TAG, "queueStopInventory: ${e.message}", e)
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
            if (!inventoryRunning.get()) return
            val rfidReader = reader ?: return
            try {
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
                    // Un solo evento por lote: evita saturar la UI y crashes al soltar el gatillo.
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
                                Log.i(TAG, "Trigger PRESSED → inventory")
                                queueStartInventory()
                            }
                            HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED -> {
                                Log.i(TAG, "Trigger RELEASED → stop")
                                // Parar enseguida fuera del hilo del SDK.
                                queueStopInventory()
                            }
                            else -> Unit
                        }
                    }
                    STATUS_EVENT_TYPE.DISCONNECTION_EVENT -> {
                        inventoryRunning.set(false)
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

    companion object {
        private const val TAG = "ZebraRfidReader"
    }
}

class RfidException(val error: AppError) : Exception(error.displayMessage())
