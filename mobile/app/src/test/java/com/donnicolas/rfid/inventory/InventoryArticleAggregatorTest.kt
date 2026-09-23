package com.donnicolas.rfid.inventory

import com.donnicolas.rfid.data.api.DetalleInventarioDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryArticleAggregatorTest {

    @Test
    fun groupsExpectedByActivoAndCountsReads() {
        val expected = listOf(
            detalle("1", "act-a", "EPC001", "PAT-1001", "Notebook", "esperado"),
            detalle("2", "act-a", "EPC002", "PAT-1001", "Notebook", "esperado"),
            detalle("3", "act-b", "EPC003", "PAT-2002", "Silla", "esperado"),
        )
        val rows = InventoryArticleAggregator.fromLiveScan(
            expected,
            setOf("EPC001", "EPC003"),
        )
        assertEquals(2, rows.size)
        val notebook = rows.first { it.articulo == "PAT-1001" }
        assertEquals(1, notebook.encontrados)
        assertEquals(2, notebook.esperados)
        assertEquals(ArticleStatus.PARCIAL, notebook.status)
        assertEquals("1 / 2", notebook.cantidadLabel)

        val silla = rows.first { it.articulo == "PAT-2002" }
        assertEquals(1, silla.encontrados)
        assertEquals(1, silla.esperados)
        assertEquals(ArticleStatus.OK, silla.status)
    }

    @Test
    fun ignoresUnrelatedSurplusOutsideArticleKeys() {
        val expected = listOf(
            detalle("1", "act-a", "EPC001", "PAT-1001", "Notebook", "esperado"),
        )
        val surplusEpc = "ZZZZNOTASYSTEMTAG0001"
        val rows = InventoryArticleAggregator.fromLiveScan(
            expected,
            setOf(surplusEpc),
        )
        assertEquals(1, rows.size)
        val notebook = rows.first { it.articulo == "PAT-1001" }
        assertEquals(0, notebook.encontrados)
        assertEquals(1, notebook.esperados)
        assertEquals(0, notebook.sobrantes)
        assertEquals(ArticleStatus.FALTA, notebook.status)
        assertEquals("0 / 1", notebook.cantidadLabel)
    }

    @Test
    fun fromDetallesCountsSobranteAsExcessOnSameSku() {
        val detalles = listOf(
            detalle("1", "act-a", "E1", "PAT-1", "A", "encontrado"),
            detalle("2", "act-a", "E2", "PAT-1", "A", "faltante"),
            detalle("3", "act-a", "E3", "PAT-1", "A", "sobrante"),
        )
        val rows = InventoryArticleAggregator.fromDetalles(detalles)
        assertEquals(1, rows.size)
        val a = rows.first { it.articulo == "PAT-1" }
        assertEquals(1, a.encontrados)
        assertEquals(2, a.esperados)
        assertEquals(1, a.sobrantes)
        assertEquals("2 / 2", a.cantidadLabel)
        assertEquals(ArticleStatus.PARCIAL, a.status)
    }

    @Test
    fun extraOfSameSkuShowsExcessCount() {
        val expected = listOf(
            detalle("1", "act-a", "D100000003E90000000001A1", "ABC-1001", "Notebook", "esperado"),
            detalle("2", "act-a", "D100000003E90000000002A1", "ABC-1001", "Notebook", "esperado"),
            detalle("3", "act-a", "D100000003E90000000003A1", "ABC-1001", "Notebook", "esperado"),
            detalle("4", "act-a", "D100000003E90000000004A1", "ABC-1001", "Notebook", "esperado"),
        )
        val reads = setOf(
            "D100000003E90000000001A1",
            "D100000003E90000000002A1",
            "D100000003E90000000003A1",
            "D100000003E90000000004A1",
            "D100000003E90000000005A1", // mismo artículo, fuera del snapshot
        )
        val rows = InventoryArticleAggregator.fromLiveScan(expected, reads)
        assertEquals(1, rows.size)
        val row = rows.first()
        assertEquals(4, row.encontrados)
        assertEquals(4, row.esperados)
        assertEquals(1, row.sobrantes)
        assertEquals(5, row.leidos)
        assertEquals("5 / 4", row.cantidadLabel)
        assertEquals(ArticleStatus.EXCESO, row.status)
    }

    @Test
    fun filterKeepsPartialInFaltantes() {
        val rows = listOf(
            ArticleCount("1", "PAT-1", null, 1, 2, 0, ArticleStatus.PARCIAL),
            ArticleCount("2", "PAT-2", null, 1, 1, 0, ArticleStatus.OK),
            ArticleCount("3", "PAT-3", null, 0, 0, 2, ArticleStatus.SOBRA),
        )
        val falt = InventoryArticleAggregator.filter(rows, ReportFilter.FALTANTES)
        assertEquals(1, falt.size)
        assertTrue(falt.all { it.status == ArticleStatus.PARCIAL })
    }

    @Test
    fun serialUnitsMarkFoundAndMissing() {
        val expected = listOf(
            detalle(
                id = "1",
                activoId = "act-a",
                epc = "EPC001",
                patrimonial = "PAT-1001",
                descripcion = "Notebook",
                estado = "esperado",
                serieFisica = "SN-AAA",
                serializado = true,
            ),
            detalle(
                id = "2",
                activoId = "act-a",
                epc = "EPC002",
                patrimonial = "PAT-1001",
                descripcion = "Notebook",
                estado = "esperado",
                serieFisica = "SN-BBB",
                serializado = true,
            ),
        )
        val rows = InventoryArticleAggregator.fromLiveScan(expected, setOf("EPC001"))
        assertEquals(1, rows.size)
        val notebook = rows.first()
        assertTrue(notebook.serializado)
        assertEquals(2, notebook.units.size)
        val found = notebook.units.first { it.serieFisica == "SN-AAA" }
        val missing = notebook.units.first { it.serieFisica == "SN-BBB" }
        assertTrue(found.encontrado)
        assertEquals("encontrado", found.estado)
        assertTrue(!missing.encontrado)
        assertEquals("faltante", missing.estado)
    }

    private fun detalle(
        id: String,
        activoId: String?,
        epc: String?,
        patrimonial: String?,
        descripcion: String?,
        estado: String,
        serieFisica: String? = null,
        serializado: Boolean? = null,
    ) = DetalleInventarioDto(
        id = id,
        activoId = activoId,
        epc = epc,
        numeroPatrimonial = patrimonial,
        descripcion = descripcion,
        estado = estado,
        serieFisica = serieFisica,
        serializado = serializado,
    )
}
