package com.donnicolas.rfid.data.local

import android.content.Context

class TokenStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun saveToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    fun isLoggedIn(): Boolean = !getToken().isNullOrBlank()

    companion object {
        private const val PREFS_NAME = "don_nicolas_auth"
        private const val KEY_TOKEN = "access_token"
    }
}
