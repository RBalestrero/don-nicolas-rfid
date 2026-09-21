package com.donnicolas.rfid.inventory

import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.rfid.EpcScheme

/**
 * Claves de artículo alineadas con backend `_keys_articulo` /
 * `clasificar_sobrantes`: `A:{uuid}`, `P:{patrimonial}`, `C:{dígitos}`.
 */
object ArticleKeys {
    fun of(detalle: DetalleInventarioDto): Set<String> {
        val keys = linkedSetOf<String>()
        val pat = detalle.numeroPatrimonial?.trim()?.uppercase().orEmpty()
        if (pat.isNotEmpty()) {
            keys.add("P:$pat")
            val digits = pat.filter { it.isDigit() }
            if (digits.isNotEmpty()) {
                keys.add("C:${digits.toLong()}")
            }
        }
        detalle.activoId?.takeIf { it.isNotBlank() }?.let { keys.add("A:$it") }
        keys.addAll(ofEpc(EpcScheme.normalize(detalle.epc)))
        return keys
    }

    fun ofEpc(epc: String): Set<String> {
        val code = EpcScheme.decodeArticuloCode(epc) ?: return emptySet()
        val suggested = EpcScheme.suggestPatrimonial(epc)?.uppercase()
        return buildSet {
            add("C:$code")
            if (!suggested.isNullOrBlank()) add("P:$suggested")
        }
    }

    fun displayKey(detalle: DetalleInventarioDto, epcFallback: String): String {
        detalle.activoId?.takeIf { it.isNotBlank() }?.let { return "A:$it" }
        detalle.numeroPatrimonial?.takeIf { it.isNotBlank() }?.let { return "P:${it.uppercase()}" }
        EpcScheme.suggestPatrimonial(epcFallback)?.let { return "P:$it" }
        return "E:$epcFallback"
    }

    fun clasificarSobrantes(
        detalles: List<DetalleInventarioDto>,
    ): Pair<List<DetalleInventarioDto>, List<DetalleInventarioDto>> {
        val expectedKeys = mutableSetOf<String>()
        for (detalle in detalles) {
            if (detalle.estado.equals("sobrante", ignoreCase = true)) continue
            expectedKeys.addAll(of(detalle))
        }
        val excesos = mutableListOf<DetalleInventarioDto>()
        val ajenos = mutableListOf<DetalleInventarioDto>()
        for (detalle in detalles) {
            if (!detalle.estado.equals("sobrante", ignoreCase = true)) continue
            val keys = of(detalle)
            if (keys.isNotEmpty() && keys.any { it in expectedKeys }) {
                excesos.add(detalle)
            } else {
                ajenos.add(detalle)
            }
        }
        return excesos to ajenos
    }
}
