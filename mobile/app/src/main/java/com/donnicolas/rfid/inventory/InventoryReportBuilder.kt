package com.donnicolas.rfid.inventory

import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioReporteDto

/**
 * Agrupa el resultado de inventario en listas de discrepancia.
 *
 * Los sobrantes se separan igual que en el backend y la web:
 * - **exceso**: unidad de más de un artículo que sí pertenece al depósito → discrepancia.
 * - **ajeno**: etiqueta de afuera del alcance → se informa, no es discrepancia.
 */
object InventoryReportBuilder {
    fun fromInventario(inventario: InventarioDto): InventoryReport {
        val detalles = inventario.detalles
        val encontrados = detalles.filter { it.estado == "encontrado" }
        val faltantes = detalles.filter { it.estado == "faltante" }
        val sobrantes = detalles.filter { it.estado == "sobrante" }
        val esperado = inventario.resumen?.totalEsperado ?: inventario.totalEsperado
        val encontrado = inventario.resumen?.totalEncontrado ?: inventario.totalEncontrado
        // Sin el reporte del servidor no se puede clasificar exceso vs ajeno
        // (requiere el catálogo de artículos del depósito): se usa el contador
        // que ya trae el inventario y el resto queda como ajeno.
        val totalExceso = inventario.resumen?.totalExceso ?: inventario.totalExceso
        val excesos = sobrantes.take(totalExceso)
        val ajenos = sobrantes.drop(totalExceso)
        val coincidencia = if (esperado <= 0) 0.0 else (100.0 * encontrado / esperado)
        return InventoryReport(
            esperado = esperado,
            encontrado = encontrado,
            faltante = faltantes.size,
            sobrante = sobrantes.size,
            exceso = excesos.size,
            coincidenciaPct = (coincidencia * 10).toInt() / 10.0,
            tieneDiscrepancias = faltantes.isNotEmpty() || excesos.isNotEmpty(),
            encontrados = encontrados,
            faltantes = faltantes,
            excesos = excesos,
            ajenos = ajenos,
            sobrantes = sobrantes,
        )
    }

    fun fromReporteDto(reporte: InventarioReporteDto): InventoryReport {
        // Compat con backends que aún no separan exceso/ajeno: si no vienen las
        // listas nuevas, todos los sobrantes se tratan como ajenos.
        val excesos = reporte.excesos
        val ajenos = reporte.ajenos.ifEmpty {
            if (excesos.isEmpty()) reporte.sobrantes else reporte.sobrantes - excesos.toSet()
        }
        return InventoryReport(
            esperado = reporte.resumen.totalEsperado,
            encontrado = reporte.resumen.totalEncontrado,
            faltante = reporte.resumen.totalFaltante,
            sobrante = reporte.resumen.totalSobrante,
            exceso = reporte.resumen.totalExceso,
            coincidenciaPct = reporte.coincidenciaPct,
            tieneDiscrepancias = reporte.tieneDiscrepancias,
            encontrados = reporte.encontrados,
            faltantes = reporte.faltantes,
            excesos = excesos,
            ajenos = ajenos,
            sobrantes = reporte.sobrantes,
        )
    }
}

data class InventoryReport(
    val esperado: Int,
    val encontrado: Int,
    val faltante: Int,
    val sobrante: Int,
    val exceso: Int = 0,
    val coincidenciaPct: Double,
    val tieneDiscrepancias: Boolean,
    val encontrados: List<DetalleInventarioDto>,
    val faltantes: List<DetalleInventarioDto>,
    val excesos: List<DetalleInventarioDto> = emptyList(),
    val ajenos: List<DetalleInventarioDto> = emptyList(),
    val sobrantes: List<DetalleInventarioDto>,
) {
    val ajeno: Int get() = (sobrante - exceso).coerceAtLeast(0)

    fun filtered(filter: ReportFilter): List<DetalleInventarioDto> {
        return when (filter) {
            ReportFilter.TODOS -> faltantes + sobrantes + encontrados
            ReportFilter.FALTANTES -> faltantes
            ReportFilter.SOBRANTES -> excesos + ajenos
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
