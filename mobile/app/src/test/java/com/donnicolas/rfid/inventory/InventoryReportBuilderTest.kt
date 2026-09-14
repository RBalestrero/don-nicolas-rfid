package com.donnicolas.rfid.inventory

import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioReporteDto
import com.donnicolas.rfid.data.api.InventarioResumenDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryReportBuilderTest {
    @Test
    fun `agrupa faltantes sobrantes y calcula coincidencia`() {
        val inventario = InventarioDto(
            id = "inv-1",
            depositoId = "dep-1",
            estado = "cerrado",
            totalEsperado = 3,
            totalEncontrado = 1,
            totalFaltante = 2,
            totalSobrante = 1,
            resumen = InventarioResumenDto(
                totalEsperado = 3,
                totalEncontrado = 1,
                totalFaltante = 2,
                totalSobrante = 1,
            ),
            detalles = listOf(
                detalle("1", "E1", "encontrado"),
                detalle("2", "E2", "faltante"),
                detalle("3", "E3", "faltante"),
                detalle("4", "E9", "sobrante"),
            ),
        )

        val report = InventoryReportBuilder.fromInventario(inventario)
        assertTrue(report.tieneDiscrepancias)
        assertEquals(33.3, report.coincidenciaPct, 0.01)
        assertEquals(1, report.encontrados.size)
        assertEquals(2, report.faltantes.size)
        assertEquals(1, report.sobrantes.size)
        assertEquals(2, report.filtered(ReportFilter.FALTANTES).size)
        assertEquals(4, report.filtered(ReportFilter.TODOS).size)
    }

    @Test
    fun `sin discrepancias`() {
        val inventario = InventarioDto(
            id = "inv-2",
            depositoId = "dep-1",
            estado = "cerrado",
            totalEsperado = 2,
            totalEncontrado = 2,
            totalFaltante = 0,
            totalSobrante = 0,
            resumen = InventarioResumenDto(2, 2, 0, 0),
            detalles = listOf(
                detalle("1", "E1", "encontrado"),
                detalle("2", "E2", "encontrado"),
            ),
        )
        val report = InventoryReportBuilder.fromInventario(inventario)
        assertFalse(report.tieneDiscrepancias)
        assertEquals(100.0, report.coincidenciaPct, 0.01)
    }

    @Test
    fun `solo etiquetas ajenas no es discrepancia`() {
        // Mismo criterio que backend (total_faltante > 0 or total_exceso > 0)
        // y que la web en filterInventarios.ts.
        val reporte = InventarioReporteDto(
            inventarioId = "inv-3",
            depositoId = "dep-1",
            estado = "cerrado",
            resumen = InventarioResumenDto(
                totalEsperado = 2,
                totalEncontrado = 2,
                totalFaltante = 0,
                totalSobrante = 1,
                totalExceso = 0,
            ),
            coincidenciaPct = 100.0,
            tieneDiscrepancias = false,
            encontrados = listOf(detalle("1", "E1", "encontrado"), detalle("2", "E2", "encontrado")),
            ajenos = listOf(detalle("9", "E9", "sobrante")),
            sobrantes = listOf(detalle("9", "E9", "sobrante")),
        )

        val report = InventoryReportBuilder.fromReporteDto(reporte)
        assertFalse(report.tieneDiscrepancias)
        assertEquals(0, report.exceso)
        assertEquals(1, report.ajeno)
        assertEquals(1, report.filtered(ReportFilter.SOBRANTES).size)
    }

    @Test
    fun `un exceso si es discrepancia y se separa del ajeno`() {
        val reporte = InventarioReporteDto(
            inventarioId = "inv-4",
            depositoId = "dep-1",
            estado = "cerrado",
            resumen = InventarioResumenDto(
                totalEsperado = 1,
                totalEncontrado = 1,
                totalFaltante = 0,
                totalSobrante = 2,
                totalExceso = 1,
            ),
            coincidenciaPct = 100.0,
            tieneDiscrepancias = true,
            encontrados = listOf(detalle("1", "E1", "encontrado")),
            excesos = listOf(detalle("8", "E8", "sobrante")),
            ajenos = listOf(detalle("9", "E9", "sobrante")),
            sobrantes = listOf(detalle("8", "E8", "sobrante"), detalle("9", "E9", "sobrante")),
        )

        val report = InventoryReportBuilder.fromReporteDto(reporte)
        assertTrue(report.tieneDiscrepancias)
        assertEquals(1, report.exceso)
        assertEquals(1, report.ajeno)
        assertEquals(2, report.filtered(ReportFilter.SOBRANTES).size)
    }

    @Test
    fun `backend sin listas exceso ajeno trata los sobrantes como ajenos`() {
        val reporte = InventarioReporteDto(
            inventarioId = "inv-5",
            depositoId = "dep-1",
            estado = "cerrado",
            resumen = InventarioResumenDto(
                totalEsperado = 1,
                totalEncontrado = 1,
                totalSobrante = 1,
            ),
            coincidenciaPct = 100.0,
            tieneDiscrepancias = false,
            encontrados = listOf(detalle("1", "E1", "encontrado")),
            sobrantes = listOf(detalle("9", "E9", "sobrante")),
        )

        val report = InventoryReportBuilder.fromReporteDto(reporte)
        assertEquals(0, report.exceso)
        assertEquals(listOf("9"), report.ajenos.map { it.id })
    }

    private fun detalle(id: String, epc: String, estado: String) = DetalleInventarioDto(
        id = id,
        epc = epc,
        numeroPatrimonial = "P-$epc",
        descripcion = "Item $epc",
        estado = estado,
    )
}
