package com.donnicolas.rfid.rfid

import com.donnicolas.rfid.data.model.AppError
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.math.min
import kotlin.random.Random

/**
 * Lector RFID simulado para emulador/CI.
 * Emite lecturas masivas de EPCs únicos con relecturas (como un MC33R real).
 * También simula TagLocationing (proximidad creciente).
 */
class SimulatedRfidReader(
    private val uniqueTagTarget: Int = 1200,
    private val tagsPerBurst: Int = 80,
    private val burstIntervalMs: Long = 50L,
    private val random: Random = Random(42),
) : RfidReader {
    override val modeName: String = "SIMULATOR"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()
    private val eventsFlow = MutableSharedFlow<RfidEvent>(extraBufferCapacity = 256)

    private var state: RfidReaderState = RfidReaderState.DISCONNECTED
    private var inventoryJob: Job? = null
    private var locateJob: Job? = null
    private var triggerMode: RfidTriggerMode = RfidTriggerMode.INVENTORY
    private var locateTargetEpc: String? = null
    private val catalog: List<String> = (1..uniqueTagTarget).map { index ->
        "E2801160%016X".format(index.toLong())
    }

    override fun events(): Flow<RfidEvent> = eventsFlow.asSharedFlow()

    override suspend fun connect() {
        mutex.withLock {
            if (state == RfidReaderState.READY ||
                state == RfidReaderState.INVENTORY_RUNNING ||
                state == RfidReaderState.LOCATE_RUNNING
            ) {
                return
            }
            setState(RfidReaderState.CONNECTING)
        }
        delay(80)
        mutex.withLock {
            setState(RfidReaderState.READY)
        }
    }

    override suspend fun disconnect() {
        stopInventoryInternal()
        stopLocateInternal()
        mutex.withLock {
            locateTargetEpc = null
            triggerMode = RfidTriggerMode.INVENTORY
            setState(RfidReaderState.DISCONNECTED)
        }
    }

    override suspend fun startInventory() {
        mutex.withLock {
            when (state) {
                RfidReaderState.DISCONNECTED, RfidReaderState.ERROR -> {
                    emitFailure(
                        AppError(
                            code = "RFID_NOT_CONNECTED",
                            title = "Lector RFID no conectado",
                            detail = "No se puede iniciar inventario porque el lector está en estado $state. " +
                                "Llamá a connect() antes de startInventory().",
                        ),
                    )
                    return
                }
                RfidReaderState.CONNECTING -> {
                    emitFailure(
                        AppError(
                            code = "RFID_STILL_CONNECTING",
                            title = "Lector aún conectando",
                            detail = "El lector RFID todavía está en CONNECTING. Esperá a READY antes de inventariar.",
                        ),
                    )
                    return
                }
                RfidReaderState.INVENTORY_RUNNING, RfidReaderState.LOCATE_RUNNING -> return
                RfidReaderState.READY -> Unit
            }
            setState(RfidReaderState.INVENTORY_RUNNING)
        }

        inventoryJob = scope.launch {
            while (isActive) {
                val burst = buildBurst()
                eventsFlow.emit(RfidEvent.BatchRead(burst))
                burst.forEach { eventsFlow.emit(RfidEvent.TagRead(it)) }
                delay(burstIntervalMs)
            }
        }
    }

    override suspend fun stopInventory() {
        stopInventoryInternal()
        mutex.withLock {
            if (state == RfidReaderState.INVENTORY_RUNNING) {
                setState(RfidReaderState.READY)
            }
        }
    }

    override suspend fun setTriggerMode(mode: RfidTriggerMode) {
        stopInventoryInternal()
        stopLocateInternal()
        mutex.withLock {
            triggerMode = mode
            if (mode == RfidTriggerMode.INVENTORY) {
                locateTargetEpc = null
            }
            if (state != RfidReaderState.DISCONNECTED && state != RfidReaderState.ERROR) {
                setState(RfidReaderState.READY)
            }
        }
    }

    override suspend fun armLocateTarget(epc: String) {
        val normalized = epc.trim().uppercase()
        require(normalized.isNotEmpty())
        stopInventoryInternal()
        stopLocateInternal()
        mutex.withLock {
            locateTargetEpc = normalized
            triggerMode = RfidTriggerMode.LOCATE
            if (state != RfidReaderState.DISCONNECTED && state != RfidReaderState.ERROR) {
                setState(RfidReaderState.READY)
            }
        }
    }

    override suspend fun clearLocateTarget() {
        stopLocateInternal()
        mutex.withLock {
            locateTargetEpc = null
            triggerMode = RfidTriggerMode.INVENTORY
            if (state != RfidReaderState.DISCONNECTED && state != RfidReaderState.ERROR) {
                setState(RfidReaderState.READY)
            }
        }
    }

    override suspend fun startLocate() {
        val epc = mutex.withLock {
            when (state) {
                RfidReaderState.DISCONNECTED, RfidReaderState.ERROR -> {
                    emitFailure(
                        AppError(
                            code = "RFID_NOT_CONNECTED",
                            title = "Lector RFID no conectado",
                            detail = "startLocate() requiere connect().",
                        ),
                    )
                    return
                }
                RfidReaderState.LOCATE_RUNNING -> return
                else -> Unit
            }
            val target = locateTargetEpc
            if (target.isNullOrBlank()) {
                emitFailure(
                    AppError(
                        code = "RFID_LOCATE_NO_TARGET",
                        title = "Sin etiqueta a localizar",
                        detail = "armLocateTarget() primero.",
                    ),
                )
                return
            }
            setState(RfidReaderState.LOCATE_RUNNING)
            target
        }
        locateJob = scope.launch {
            var proximity = 5
            while (isActive) {
                proximity = min(100, proximity + 3 + random.nextInt(8))
                val rssi = -70 + (proximity * 45 / 100)
                eventsFlow.emit(
                    RfidEvent.LocateUpdate(
                        epc = epc,
                        relativeDistance = proximity,
                        rssi = rssi,
                    ),
                )
                delay(120)
            }
        }
    }

    override suspend fun stopLocate() {
        stopLocateInternal()
        mutex.withLock {
            if (state == RfidReaderState.LOCATE_RUNNING) {
                setState(RfidReaderState.READY)
            }
        }
    }

    private suspend fun stopInventoryInternal() {
        inventoryJob?.cancel()
        inventoryJob = null
    }

    private suspend fun stopLocateInternal() {
        locateJob?.cancel()
        locateJob = null
    }

    private fun buildBurst(): List<RfidTag> {
        val now = System.currentTimeMillis()
        return List(tagsPerBurst) {
            val epc = catalog[random.nextInt(catalog.size)]
            RfidTag(
                epc = epc,
                rssi = -45 - random.nextInt(35),
                antenna = 1 + random.nextInt(2),
                seenCount = 1,
                lastSeenAtMs = now,
            )
        }
    }

    private suspend fun setState(newState: RfidReaderState) {
        state = newState
        eventsFlow.emit(RfidEvent.StateChanged(newState))
    }

    private suspend fun emitFailure(error: AppError) {
        setState(RfidReaderState.ERROR)
        eventsFlow.emit(RfidEvent.Failure(error))
    }
}
