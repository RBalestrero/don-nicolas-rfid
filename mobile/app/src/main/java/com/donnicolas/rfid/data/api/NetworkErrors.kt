package com.donnicolas.rfid.data.api

import java.io.IOException
import retrofit2.HttpException

/** Distingue fallos de transporte de errores HTTP de la API. */
object NetworkErrors {
    fun isNetworkError(error: Throwable): Boolean {
        var current: Throwable? = error
        while (current != null) {
            if (current is HttpException) return false
            if (current is IOException) return true
            current = current.cause
        }
        val msg = (error.message ?: "").lowercase()
        return msg.contains("failed to connect") ||
            msg.contains("unable to resolve") ||
            msg.contains("failed to resolve")
    }

    fun isUnauthorized(error: Throwable): Boolean {
        var current: Throwable? = error
        while (current != null) {
            if (current is HttpException && current.code() == 401) return true
            current = current.cause
        }
        return false
    }
}
