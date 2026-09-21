package com.donnicolas.rfid.rfid

import java.util.concurrent.ConcurrentLinkedQueue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Entrega eventos RFID a varios collectors.
 *
 * Los lotes de inventario no se tiran si el collector de UI va lento:
 * van a una cola y se reintentan. El SharedFlow anterior con `tryEmit`
 * (buffer 512) perdía EPCs únicos en barridos densos.
 */
internal class RfidEventBus(
    extraBufferCapacity: Int = 8192,
) {
    private val pendingTags = ConcurrentLinkedQueue<RfidTag>()
    private val eventsFlow = MutableSharedFlow<RfidEvent>(extraBufferCapacity = extraBufferCapacity)

    fun events(): Flow<RfidEvent> = eventsFlow.asSharedFlow()

    fun emit(event: RfidEvent) {
        if (event is RfidEvent.BatchRead) {
            emitTags(event.tags)
            return
        }
        eventsFlow.tryEmit(event)
    }

    fun emitTags(tags: List<RfidTag>) {
        tags.forEach { pendingTags.offer(it) }
        flushPending()
    }

    fun flushPending() {
        repeat(64) {
            val batch = ArrayList<RfidTag>(BATCH_SIZE)
            while (batch.size < BATCH_SIZE) {
                val tag = pendingTags.poll() ?: break
                batch.add(tag)
            }
            if (batch.isEmpty()) return
            if (!eventsFlow.tryEmit(RfidEvent.BatchRead(batch))) {
                batch.forEach { pendingTags.offer(it) }
                return
            }
        }
    }

    private companion object {
        const val BATCH_SIZE = 128
    }
}
