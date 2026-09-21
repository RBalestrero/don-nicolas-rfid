package com.donnicolas.rfid.inventory

import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.rfid.EpcScheme

enum class ArticleStatus {
    OK,
    PARCIAL,
    FALTA,
    /** Leídos > esperados del mismo artículo. */
    EXCESO,
    SOBRA,
}

/**
 * Una fila de inventario agrupada por artículo (no por EPC).
 *
 * [encontrados]: etiquetas esperadas que se leyeron.
 * [esperados]: etiquetas que debían estar.
 * [sobrantes]: etiquetas leídas de este artículo que no estaban en el snapshot.
 */
data class ArticleCount(
    val key: String,
    val articulo: String,
    val descripcion: String?,
    val encontrados: Int,
    val esperados: Int,
    val sobrantes: Int = 0,
    val status: ArticleStatus,
) {
    /** Total de unidades leídas de este artículo (esperadas halladas + exceso). */
    val leidos: Int get() = encontrados + sobrantes

    /** Compat: total leído. */
    val cantidad: Int get() = leidos

    /** Texto de cantidad: leídos / esperados. */
    val cantidadLabel: String
        get() = when {
            esperados > 0 -> "$leidos / $esperados"
            else -> "$leidos"
        }
}

/**
 * Agrupa lecturas RFID por tipo de producto (artículo) y cantidad.
 */
object InventoryArticleAggregator {

    fun fromLiveScan(
        expectedDetalles: List<DetalleInventarioDto>,
        readEpcs: Set<String>,
    ): List<ArticleCount> {
        val read = readEpcs.map { EpcScheme.normalize(it) }.filter { it.isNotEmpty() }.toSet()
        val expectedWithEpc = expectedDetalles.mapNotNull { d ->
            val epc = EpcScheme.normalize(d.epc)
            if (epc.isEmpty()) null else epc to d
        }
        val expectedEpcSet = expectedWithEpc.map { it.first }.toSet()
        val buckets = linkedMapOf<String, MutableBucket>()

        for ((epc, detalle) in expectedWithEpc) {
            val keys = ArticleKeys.of(detalle)
            val matching = buckets.values.firstOrNull { bucket ->
                bucket.keys.any { it in keys }
            }
            val bucket = matching ?: buckets.getOrPut(ArticleKeys.displayKey(detalle, epc)) {
                MutableBucket(
                    key = ArticleKeys.displayKey(detalle, epc),
                    articulo = detalle.numeroPatrimonial?.takeIf { it.isNotBlank() }
                        ?: EpcScheme.suggestPatrimonial(epc)
                        ?: epc,
                    descripcion = detalle.descripcion,
                    keys = keys.toMutableSet(),
                )
            }
            bucket.keys.addAll(keys)
            bucket.esperados += 1
            if (epc in read) bucket.encontrados += 1
            if (bucket.descripcion.isNullOrBlank() && !detalle.descripcion.isNullOrBlank()) {
                bucket.descripcion = detalle.descripcion
            }
        }

        // Exceso del mismo artículo: EPC leído que no estaba en el snapshot pero matchea un bucket.
        for (epc in read) {
            if (epc in expectedEpcSet) continue
            val keys = ArticleKeys.ofEpc(epc)
            if (keys.isEmpty()) continue
            val matching = buckets.values.firstOrNull { bucket ->
                bucket.keys.any { it in keys }
            } ?: continue
            matching.sobrantes += 1
        }

        return buckets.values.map { it.toArticleCount() }
            .sortedWith(
                compareBy<ArticleCount> {
                    when (it.status) {
                        ArticleStatus.FALTA -> 0
                        ArticleStatus.PARCIAL -> 1
                        ArticleStatus.EXCESO -> 2
                        ArticleStatus.SOBRA -> 3
                        ArticleStatus.OK -> 4
                    }
                }.thenBy { it.articulo },
            )
    }

    fun fromDetalles(detalles: List<DetalleInventarioDto>): List<ArticleCount> {
        val buckets = linkedMapOf<String, MutableBucket>()
        for (detalle in detalles) {
            if (detalle.estado.equals("sobrante", ignoreCase = true)) {
                // Exceso del mismo SKU: sumar al bucket si ya existe por keys.
                val epc = EpcScheme.normalize(detalle.epc)
                val keys = ArticleKeys.of(detalle)
                val matching = buckets.values.firstOrNull { bucket ->
                    keys.any { it in bucket.keys }
                }
                if (matching != null) {
                    matching.sobrantes += 1
                    matching.keys.addAll(keys)
                    if (matching.descripcion.isNullOrBlank() && !detalle.descripcion.isNullOrBlank()) {
                        matching.descripcion = detalle.descripcion
                    }
                }
                continue
            }
            val epc = EpcScheme.normalize(detalle.epc)
            val keys = ArticleKeys.of(detalle)
            val matching = buckets.values.firstOrNull { bucket ->
                keys.any { it in bucket.keys }
            }
            val bucket = matching ?: buckets.getOrPut(ArticleKeys.displayKey(detalle, epc.ifEmpty { detalle.id })) {
                MutableBucket(
                    key = ArticleKeys.displayKey(detalle, epc.ifEmpty { detalle.id }),
                    articulo = detalle.numeroPatrimonial?.takeIf { it.isNotBlank() }
                        ?: EpcScheme.suggestPatrimonial(epc)
                        ?: epc.ifEmpty { detalle.id },
                    descripcion = detalle.descripcion,
                    keys = keys.toMutableSet(),
                )
            }
            bucket.keys.addAll(keys)
            when (detalle.estado.lowercase()) {
                "encontrado" -> {
                    bucket.esperados += 1
                    bucket.encontrados += 1
                }
                "faltante", "esperado" -> bucket.esperados += 1
                else -> bucket.esperados += 1
            }
            if (bucket.descripcion.isNullOrBlank() && !detalle.descripcion.isNullOrBlank()) {
                bucket.descripcion = detalle.descripcion
            }
        }
        return buckets.values.map { it.toArticleCount() }
            .sortedWith(
                compareBy<ArticleCount> {
                    when (it.status) {
                        ArticleStatus.FALTA -> 0
                        ArticleStatus.PARCIAL -> 1
                        ArticleStatus.EXCESO -> 2
                        ArticleStatus.SOBRA -> 3
                        ArticleStatus.OK -> 4
                    }
                }.thenBy { it.articulo },
            )
    }

    fun filter(rows: List<ArticleCount>, filter: ReportFilter): List<ArticleCount> {
        return when (filter) {
            ReportFilter.TODOS -> rows
            ReportFilter.FALTANTES -> rows.filter { it.encontrados < it.esperados }
            ReportFilter.SOBRANTES -> rows.filter {
                it.sobrantes > 0 || it.status == ArticleStatus.EXCESO
            }
            ReportFilter.ENCONTRADOS -> rows.filter { it.status == ArticleStatus.OK }
        }
    }

    private data class MutableBucket(
        val key: String,
        var articulo: String,
        var descripcion: String?,
        val keys: MutableSet<String> = mutableSetOf(),
        var encontrados: Int = 0,
        var esperados: Int = 0,
        var sobrantes: Int = 0,
    ) {
        fun toArticleCount(): ArticleCount {
            val leidos = encontrados + sobrantes
            val status = when {
                esperados > 0 && leidos > esperados -> ArticleStatus.EXCESO
                esperados == 0 && sobrantes > 0 -> ArticleStatus.SOBRA
                esperados > 0 && encontrados == 0 && sobrantes == 0 -> ArticleStatus.FALTA
                esperados > 0 && encontrados < esperados -> ArticleStatus.PARCIAL
                else -> ArticleStatus.OK
            }
            return ArticleCount(
                key = key,
                articulo = articulo,
                descripcion = descripcion,
                encontrados = encontrados,
                esperados = esperados,
                sobrantes = sobrantes,
                status = status,
            )
        }
    }
}
