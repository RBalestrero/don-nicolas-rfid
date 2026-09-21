package com.donnicolas.rfid.rfid

/**
 * Esquema EPC-96 Don Nicolás (alineado con backend epc_generator.py):
 *
 *   D1 | ARTÍCULO (10 hex) | SERIAL (10 hex) | A1
 *
 * El serial hace única cada etiqueta; el código de artículo (SKU) es compartido
 * entre unidades del mismo tipo. Localizar filtra por prefijo D1+ART (48 bits).
 */
object EpcScheme {
    const val PREFIX = "D1"
    const val SYSTEM_SUFFIX = "A1"
    const val EPC_HEX_LEN = 24
    /** Prefijo de localización por SKU: D1 + 10 hex de artículo. */
    const val ARTICULO_PREFIX_HEX_LEN = 12
    private const val ART_HEX_LEN = 10
    private const val MAX_ART = (1L shl 40) - 1L

    fun normalize(epc: String?): String =
        epc?.trim()?.uppercase()?.replace(" ", "").orEmpty()

    /**
     * True si el EPC es del sistema Don Nicolás.
     * - Ideal: `D1…………A1` (24 hex)
     * - Legado: `D1` + 22 hex (sin sufijo A1, etiquetas ya en campo)
     * Rechaza ajenos (p. ej. E280…).
     */
    fun belongsToSystem(epc: String?): Boolean {
        val raw = normalize(epc)
        if (raw.length != EPC_HEX_LEN) return false
        if (!raw.all { it in '0'..'9' || it in 'A'..'F' }) return false
        if (!raw.startsWith(PREFIX)) return false
        return true
    }

    fun hasSystemSuffix(epc: String?): Boolean {
        val raw = normalize(epc)
        return raw.length == EPC_HEX_LEN && raw.endsWith(SYSTEM_SUFFIX)
    }

    /**
     * Extrae el código de artículo (40 bits) embebido en un EPC D1.
     * Posiciones hex: [2..12) tras el prefijo D1.
     */
    fun decodeArticuloCode(epc: String?): Long? {
        val raw = normalize(epc)
        if (!belongsToSystem(raw)) return null
        return runCatching { raw.substring(2, 2 + ART_HEX_LEN).toLong(16) }.getOrNull()
    }

    /**
     * Prefijo hex de 12 caracteres (`D1` + artículo) para PreFilter / match por SKU.
     */
    fun articuloPrefixHex(epc: String?): String? {
        val raw = normalize(epc)
        if (!belongsToSystem(raw)) return null
        return raw.substring(0, ARTICULO_PREFIX_HEX_LEN)
    }

    fun articuloPrefixFromCode(articuloCode: Long): String? {
        if (articuloCode < 0 || articuloCode > MAX_ART) return null
        return PREFIX + articuloCode.toString(16).uppercase().padStart(ART_HEX_LEN, '0')
    }

    /**
     * Misma derivación que backend `articulo_code_from_patrimonial`:
     * dígitos del patrimonial, o base-36 de alfanuméricos.
     */
    fun articuloCodeFromPatrimonial(numeroPatrimonial: String?): Long? {
        val raw = numeroPatrimonial?.trim()?.uppercase().orEmpty()
        if (raw.isEmpty()) return null
        val digits = raw.filter { it.isDigit() }
        if (digits.isNotEmpty()) {
            return digits.toLongOrNull()?.takeIf { it in 0..MAX_ART }
        }
        val cleaned = raw.filter { it in 'A'..'Z' || it in '0'..'9' }.take(8)
        if (cleaned.isEmpty()) return null
        return runCatching { cleaned.toLong(36) }.getOrNull()?.takeIf { it in 0..MAX_ART }
    }

    /** Sugerencia legible `PAT-{code}` a partir del EPC (alineado al backend). */
    fun suggestPatrimonial(epc: String?): String? {
        val code = decodeArticuloCode(epc) ?: return null
        return "PAT-$code"
    }
}
