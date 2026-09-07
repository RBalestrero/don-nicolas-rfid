package com.donnicolas.rfid.inventory

import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioDto
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

    private fun detalle(id: String, epc: String, estado: String) = DetalleInventarioDto(
        id = id,
        epc = epc,
        numeroPatrimonial = "P-$epc",
        descripcion = "Item $epc",
        estado = estado,
    )
}
