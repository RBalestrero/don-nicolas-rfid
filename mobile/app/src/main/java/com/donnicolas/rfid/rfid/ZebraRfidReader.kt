package com.donnicolas.rfid.rfid

import android.os.Build
import com.donnicolas.rfid.data.model.AppError
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Adaptador para Zebra RFID SDK (MC33R).
 *
 * Mientras el AAR propietario de Zebra no esté linkeado en Gradle, connect()
 * falla con un código explícito. Cuando se agregue el SDK, reemplazar el cuerpo
 * de connect/startInventory con las llamadas a Readers/RFIDReader de Zebra.
 *
 * Documentación esperada: Zebra RFID SDK for Android (API3).
 */
class ZebraRfidReader(
    private val sdkLinked: Boolean = false,
) : RfidReader {
    override val modeName: String = "ZEBRA"

    private val eventsFlow = MutableSharedFlow<RfidEvent>(extraBufferCapacity = 64)

    override fun events(): Flow<RfidEvent> = eventsFlow.asSharedFlow()

    override suspend fun connect() {
        eventsFlow.emit(RfidEvent.StateChanged(RfidReaderState.CONNECTING))

        if (!sdkLinked) {
            val error = AppError(
                code = "RFID_ZEBRA_SDK_NOT_LINKED",
                title = "Zebra RFID SDK no vinculado",
                detail = "El modo ZEBRA está activo pero el AAR del Zebra RFID SDK no está " +
                    "incluido en app/build.gradle.kts. Dispositivo detectado: " +
                    "${Build.MANUFACTURER} ${Build.MODEL}. " +
                    "Para desarrollo usá RFID_MODE=SIMULATOR. " +
                    "Para MC33R real: agregá el SDK Zebra API3 y seteá sdkLinked=true.",
                cause = "sdkLinked=false",
            )
            eventsFlow.emit(RfidEvent.StateChanged(RfidReaderState.ERROR))
            eventsFlow.emit(RfidEvent.Failure(error))
            throw RfidException(error)
        }

        // Hook para implementación real del SDK Zebra:
        // val readers = Readers(context, ENUM_TRANSPORT.SERVICE_SERIAL)
        // rfidReader = readers.GetAvailableRFIDReaderList().first().rfidReader
        // rfidReader.connect()
        eventsFlow.emit(RfidEvent.StateChanged(RfidReaderState.READY))
    }

    override suspend fun disconnect() {
        eventsFlow.emit(RfidEvent.StateChanged(RfidReaderState.DISCONNECTED))
    }

    override suspend fun startInventory() {
        val error = AppError(
            code = "RFID_ZEBRA_INVENTORY_UNAVAILABLE",
            title = "Inventario Zebra no disponible",
            detail = "startInventory() requiere Zebra RFID SDK vinculado y reader conectado. " +
                "En esta build el SDK aún no está linkeado.",
        )
        eventsFlow.emit(RfidEvent.Failure(error))
        throw RfidException(error)
    }

    override suspend fun stopInventory() {
        // no-op hasta integrar SDK
    }
}

class RfidException(val error: AppError) : Exception(error.displayMessage())
