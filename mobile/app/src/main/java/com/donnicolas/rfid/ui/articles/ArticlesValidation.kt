package com.donnicolas.rfid.ui.articles

/** Validación pura del flujo Artículos (testable sin ViewModel/Android). */
object ArticlesValidation {
    const val CANTIDAD_MIN = 1
    const val CANTIDAD_MAX = 50

    fun validateCantidad(cantidad: Int): String? = when {
        cantidad < CANTIDAD_MIN -> "La cantidad mínima es $CANTIDAD_MIN"
        cantidad > CANTIDAD_MAX -> "La cantidad máxima es $CANTIDAD_MAX"
        else -> null
    }

    fun validateCantidadText(raw: String): Pair<Int?, String?> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null to "Ingresá la cantidad"
        val value = trimmed.toIntOrNull()
            ?: return null to "La cantidad debe ser un número"
        return value to validateCantidad(value)
    }

    /**
     * Alta de artículo: ubicación obligatoria (igual que la web).
     * @return mensaje de error o null si es válido.
     */
    fun validateCreate(
        numeroPatrimonial: String,
        descripcion: String,
        categoriaId: String?,
        ubicacionId: String?,
    ): String? {
        if (numeroPatrimonial.trim().isEmpty()) {
            return "Ingresá el número patrimonial"
        }
        if (descripcion.trim().isEmpty()) {
            return "Ingresá la descripción"
        }
        if (categoriaId.isNullOrBlank()) {
            return "Seleccioná una categoría"
        }
        if (ubicacionId.isNullOrBlank()) {
            return "Seleccioná una ubicación"
        }
        return null
    }
}
