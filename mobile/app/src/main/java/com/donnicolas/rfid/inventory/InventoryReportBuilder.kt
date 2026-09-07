package com.donnicolas.rfid.inventory

import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioReporteDto

/**
 * Agrupa el resultado de inventario en listas de discrepancia.
 */
object InventoryReportBuilder {
    fun fromInventario(inventario: InventarioDto): InventoryReport {
        val detalles = inventario.detalles
        val encontrados = detalles.filter { it.estado == "encontrado" }
        val faltantes = detalles.filter { it.estado == "faltante" }
        val sobrantes = detalles.filter { it.estado == "sobrante" }
        val esperado = inventario.resumen?.totalEsperado ?: inventario.totalEsperado
        val encontrado = inventario.resumen?.totalEncontrado ?: inventario.totalEncontrado
        val coincidencia = if (esperado <= 0) 0.0 else (100.0 * encontrado / esperado)
        return InventoryReport(
            esperado = esperado,
            encontrado = encontrado,
            faltante = faltantes.size,
            sobrante = sobrantes.size,
            coincidenciaPct = (coincidencia * 10).toInt() / 10.0,
            tieneDiscrepancias = faltantes.isNotEmpty() || sobrantes.isNotEmpty(),
            encontrados = encontrados,
            faltantes = faltantes,
            sobrantes = sobrantes,
        )
    }

    fun fromReporteDto(reporte: InventarioReporteDto): InventoryReport {
        return InventoryReport(
            esperado = reporte.resumen.totalEsperado,
            encontrado = reporte.resumen.totalEncontrado,
            faltante = reporte.resumen.totalFaltante,
            sobrante = reporte.resumen.totalSobrante,
            coincidenciaPct = reporte.coincidenciaPct,
            tieneDiscrepancias = reporte.tieneDiscrepancias,
            encontrados = reporte.encontrados,
            faltantes = reporte.faltantes,
            sobrantes = reporte.sobrantes,
        )
    }
}

data class InventoryReport(
    val esperado: Int,
    val encontrado: Int,
    val faltante: Int,
    val sobrante: Int,
    val coincidenciaPct: Double,
    val tieneDiscrepancias: Boolean,
    val encontrados: List<DetalleInventarioDto>,
    val faltantes: List<DetalleInventarioDto>,
    val sobrantes: List<DetalleInventarioDto>,
) {
    fun filtered(filter: ReportFilter): List<DetalleInventarioDto> {
        return when (filter) {
            ReportFilter.TODOS -> faltantes + sobrantes + encontrados
            ReportFilter.FALTANTES -> faltantes
            ReportFilter.SOBRANTES -> sobrantes
            ReportFilter.ENCONTRADOS -> encontrados
        }
    }
}

enum class ReportFilter {
    TODOS,
    FALTANTES,
    SOBRANTES,
    ENCONTRADOS,
}
