package com.donnicolas.rfid.inventory

/**
 * Compara EPCs leídos contra el conjunto esperado (snapshot del depósito).
 */
object InventoryComparer {
    fun compare(expectedEpcs: Set<String>, readEpcs: Set<String>): InventoryCompareResult {
        val expected = expectedEpcs.map { it.trim().uppercase() }.filter { it.isNotEmpty() }.toSet()
        val read = readEpcs.map { it.trim().uppercase() }.filter { it.isNotEmpty() }.toSet()
        val encontrados = expected.intersect(read)
        val faltantes = expected - read
        val sobrantes = read - expected
        return InventoryCompareResult(
            esperado = expected.size,
            encontrado = encontrados.size,
            faltante = faltantes.size,
            sobrante = sobrantes.size,
            epcsEncontrados = encontrados.sorted(),
            epcsFaltantes = faltantes.sorted(),
            epcsSobrantes = sobrantes.sorted(),
        )
    }
}

data class InventoryCompareResult(
    val esperado: Int,
    val encontrado: Int,
    val faltante: Int,
    val sobrante: Int,
    val epcsEncontrados: List<String>,
    val epcsFaltantes: List<String>,
    val epcsSobrantes: List<String>,
)
