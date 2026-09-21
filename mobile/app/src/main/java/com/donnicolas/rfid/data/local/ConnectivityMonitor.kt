package com.donnicolas.rfid.data.local

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.donnicolas.rfid.BuildConfig
import java.util.concurrent.CopyOnWriteArrayList

class ConnectivityMonitor(
    context: Context,
    private val apiHostProvider: () -> String = { BuildConfig.API_HOST },
) {
    private val cm =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val listeners = CopyOnWriteArrayList<(Boolean) -> Unit>()

    /** La API vive en el propio dispositivo (USB + `adb reverse`): no necesita red. */
    private fun apiOnLoopback(): Boolean = apiHostProvider() in LOOPBACK_HOSTS

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            notifyListeners()
        }

        override fun onLost(network: Network) {
            notifyListeners()
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            notifyListeners()
        }
    }

    init {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        runCatching { cm.registerNetworkCallback(request, callback) }
    }

    /**
     * ¿Vale la pena intentar hablar con la API?
     *
     * El backend es on-premise: puede estar en una LAN sin salida a internet, o
     * en loopback cuando el MC33 está por USB con `adb reverse`. Exigir
     * NET_CAPABILITY_INTERNET o VALIDATED dejaría el prefetch de stock y la cola
     * de sync apagados aunque las llamadas HTTP funcionen perfecto.
     */
    fun isOnline(): Boolean {
        val network = cm.activeNetwork
        val caps = network?.let { cm.getNetworkCapabilities(it) }
        if (caps != null) {
            val usableTransport = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            if (usableTransport || caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                return true
            }
        }
        // Sin red activa las llamadas a loopback siguen siendo válidas (USB + adb reverse).
        return apiOnLoopback()
    }

    fun addListener(listener: (Boolean) -> Unit) {
        listeners.add(listener)
        listener(isOnline())
    }

    fun removeListener(listener: (Boolean) -> Unit) {
        listeners.remove(listener)
    }

    private fun notifyListeners() {
        val online = isOnline()
        listeners.forEach { it(online) }
    }

    private companion object {
        val LOOPBACK_HOSTS = setOf("127.0.0.1", "localhost", "::1")
    }
}
