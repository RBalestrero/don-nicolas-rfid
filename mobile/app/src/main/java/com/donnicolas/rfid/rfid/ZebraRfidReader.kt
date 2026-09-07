package com.donnicolas.rfid.rfid

import android.content.Context
import android.os.Build
import android.util.Log
import com.donnicolas.rfid.data.model.AppError
import com.zebra.rfid.api3.Antennas
import com.zebra.rfid.api3.ENUM_TRANSPORT
import com.zebra.rfid.api3.HANDHELD_TRIGGER_EVENT_TYPE
import com.zebra.rfid.api3.INVENTORY_STATE
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
import com.zebra.rfid.api3.SESSION
import com.zebra.rfid.api3.SL_FLAG
import com.zebra.rfid.api3.START_TRIGGER_TYPE
import com.zebra.rfid.api3.STATUS_EVENT_TYPE
import com.zebra.rfid.api3.STOP_TRIGGER_TYPE
import com.zebra.rfid.api3.TriggerInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Adaptador Zebra RFID API3 para handheld MC33xx.
 * Basado en HHSampleApp/RFIDHandler del SDK 2.0.5.292.
 */
class ZebraRfidReader(
    context: Context,
) : RfidReader {
    override val modeName: String = "ZEBRA"

    private val appContext = context.applicationContext
    private val eventsFlow = MutableSharedFlow<RfidEvent>(extraBufferCapacity = 256)
    private val mutex = Mutex()

    private var readers: Readers? = null
    private var reader: RFIDReader? = null
    private var eventHandler: EventHandler? = null
    private var inventoryRunning = false

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

                configureReader(rfidReader)
                reader = rfidReader
                inventoryRunning = false
                Log.i(TAG, "Conectado a ${device.name} / ${rfidReader.hostName}")
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
            runCatching { stopInventoryInternal() }
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
            inventoryRunning = false
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
                rfidReader.Actions.Inventory.perform()
                inventoryRunning = true
                emitState(RfidReaderState.INVENTORY_RUNNING)
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
            stopInventoryInternal()
            if (reader?.isConnected == true) {
                emitState(RfidReaderState.READY)
            }
        }
    }

    private fun stopInventoryInternal() {
        val rfidReader = reader ?: return
        if (!inventoryRunning) return
        try {
            rfidReader.Actions.Inventory.stop()
        } catch (e: Exception) {
            Log.w(TAG, "stopInventory: ${e.message}")
        } finally {
            inventoryRunning = false
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
                    // Algunos firmwares solo reportan REGION en vendor/status.
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
        // MC33xx integrado: SERVICE_SERIAL / QC_SERIAL primero (HHSample prueba varios).
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
                "Región RFID configurada: name=${regionInfo.name} code=${regionInfo.regionCode}",
            )
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo auto-configurar región: ${e.message}", e)
            throw failure(
                code = "RFID_REGION_CONFIG_FAILED",
                title = "No se pudo configurar la región RFID",
                detail = "El lector exige región regulatoria. Preferimos AR/FCC/ETSI según disponibilidad.",
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

    private fun configureReader(rfidReader: RFIDReader) {
        val triggerInfo = TriggerInfo()
        triggerInfo.StartTrigger.triggerType = START_TRIGGER_TYPE.START_TRIGGER_TYPE_IMMEDIATE
        triggerInfo.StopTrigger.triggerType = STOP_TRIGGER_TYPE.STOP_TRIGGER_TYPE_IMMEDIATE

        val handler = eventHandler ?: EventHandler().also { eventHandler = it }
        rfidReader.Events.addEventsListener(handler)
        rfidReader.Events.setHandheldEvent(true)
        rfidReader.Events.setTagReadEvent(true)
        rfidReader.Events.setAttachTagDataWithReadEvent(false)
        rfidReader.Events.setReaderDisconnectEvent(true)
        rfidReader.Config.setStartTrigger(triggerInfo.StartTrigger)
        rfidReader.Config.setStopTrigger(triggerInfo.StopTrigger)

        try {
            val maxPower = rfidReader.ReaderCapabilities.transmitPowerLevelValues.size - 1
            val antennaConfig: Antennas.AntennaRfConfig =
                rfidReader.Config.Antennas.getAntennaRfConfig(1)
            antennaConfig.transmitPowerIndex = maxPower
            antennaConfig.setrfModeTableIndex(0)
            antennaConfig.setTari(0)
            rfidReader.Config.Antennas.setAntennaRfConfig(1, antennaConfig)

            val singulation: Antennas.SingulationControl =
                rfidReader.Config.Antennas.getSingulationControl(1)
            singulation.session = SESSION.SESSION_S0
            singulation.Action.inventoryState = INVENTORY_STATE.INVENTORY_STATE_A
            singulation.Action.slFlag = SL_FLAG.SL_ALL
            rfidReader.Config.Antennas.setSingulationControl(1, singulation)
            rfidReader.Actions.PreFilters.deleteAll()
        } catch (e: Exception) {
            Log.w(TAG, "Config RF parcial: ${e.message}")
        }
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
                val tags = rfidReader.Actions.getReadTags(100) ?: return
                val mapped = tags.mapNotNull { tag ->
                    val epc = tag.tagID ?: return@mapNotNull null
                    RfidTag(
                        epc = epc,
                        rssi = tag.peakRSSI.toInt(),
                        antenna = tag.antennaID.toInt(),
                        seenCount = 1,
                    )
                }
                if (mapped.isNotEmpty()) {
                    eventsFlow.tryEmit(RfidEvent.BatchRead(mapped))
                    mapped.forEach { eventsFlow.tryEmit(RfidEvent.TagRead(it)) }
                }
            } catch (ex: Exception) {
                Log.e(TAG, "eventReadNotify: ${ex.message}", ex)
            }
        }

        override fun eventStatusNotify(e: RfidStatusEvents?) {
            val statusType = e?.StatusEventData?.statusEventType ?: return
            when (statusType) {
                STATUS_EVENT_TYPE.HANDHELD_TRIGGER_EVENT -> {
                    val trigger = e.StatusEventData.HandheldTriggerEventData.handheldEvent
                    when (trigger) {
                        HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_PRESSED -> {
                            Log.i(TAG, "Trigger PRESSED → inventory")
                            runCatching { reader?.Actions?.Inventory?.perform() }
                            inventoryRunning = true
                            eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.INVENTORY_RUNNING))
                        }
                        HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED -> {
                            Log.i(TAG, "Trigger RELEASED → stop")
                            runCatching { reader?.Actions?.Inventory?.stop() }
                            inventoryRunning = false
                            eventsFlow.tryEmit(RfidEvent.StateChanged(RfidReaderState.READY))
                        }
                        else -> Unit
                    }
                }
                STATUS_EVENT_TYPE.DISCONNECTION_EVENT -> {
                    inventoryRunning = false
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
        }
    }

    companion object {
        private const val TAG = "ZebraRfidReader"
    }
}

class RfidException(val error: AppError) : Exception(error.displayMessage())
