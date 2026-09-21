package com.donnicolas.rfid.ui.articles

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ArticlesValidationTest {

    @Test
    fun `cantidad dentro de rango es valida`() {
        assertNull(ArticlesValidation.validateCantidad(1))
        assertNull(ArticlesValidation.validateCantidad(50))
        assertNull(ArticlesValidation.validateCantidad(25))
    }

    @Test
    fun `cantidad fuera de rango falla`() {
        assertEquals("La cantidad mínima es 1", ArticlesValidation.validateCantidad(0))
        assertEquals("La cantidad máxima es 50", ArticlesValidation.validateCantidad(51))
    }

    @Test
    fun `cantidad texto invalido`() {
        val (_, errEmpty) = ArticlesValidation.validateCantidadText("  ")
        assertEquals("Ingresá la cantidad", errEmpty)

        val (_, errNaN) = ArticlesValidation.validateCantidadText("abc")
        assertEquals("La cantidad debe ser un número", errNaN)

        val (value, errOk) = ArticlesValidation.validateCantidadText("3")
        assertEquals(3, value)
        assertNull(errOk)
    }

    @Test
    fun `create requiere ubicacion y campos basicos`() {
        assertEquals(
            "Ingresá el número patrimonial",
            ArticlesValidation.validateCreate("", "desc", "cat", "ubi"),
        )
        assertEquals(
            "Ingresá la descripción",
            ArticlesValidation.validateCreate("P-1", "  ", "cat", "ubi"),
        )
        assertEquals(
            "Seleccioná una categoría",
            ArticlesValidation.validateCreate("P-1", "desc", null, "ubi"),
        )
        assertEquals(
            "Seleccioná una ubicación",
            ArticlesValidation.validateCreate("P-1", "desc", "cat", null),
        )
        assertNull(
            ArticlesValidation.validateCreate("P-1", "desc", "cat", "ubi"),
        )
        assertNotNull(
            ArticlesValidation.validateCreate("P-1", "desc", "cat", ""),
        )
    }
}
