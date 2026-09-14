package com.donnicolas.rfid.data.sync

import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory

@JsonClass(generateAdapter = false)
data class InventorySyncPayload(
    val depositoId: String,
    val depositoNombre: String,
    val expectedEpcs: List<String>,
    val readEpcs: List<String>,
    val localSessionId: String,
    /**
     * Inventario ya creado en el servidor para este conteo offline.
     * Se persiste apenas responde el POST /inventarios para que un reintento
     * cierre ese mismo inventario en vez de crear otro.
     */
    val remoteInventarioId: String? = null,
)

object SyncJson {
    val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val inventoryAdapter = moshi.adapter(InventorySyncPayload::class.java)
    private val stringListType = Types.newParameterizedType(List::class.java, String::class.java)
    private val stringListAdapter = moshi.adapter<List<String>>(stringListType)

    fun toJson(payload: InventorySyncPayload): String = inventoryAdapter.toJson(payload)

    fun inventoryFromJson(json: String): InventorySyncPayload =
        inventoryAdapter.fromJson(json) ?: error("Invalid InventorySyncPayload")

    fun epcsToJson(epcs: Collection<String>): String = stringListAdapter.toJson(epcs.toList())

    fun epcsFromJson(json: String): List<String> = stringListAdapter.fromJson(json).orEmpty()
}
