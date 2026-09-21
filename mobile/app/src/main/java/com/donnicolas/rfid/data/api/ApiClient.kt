package com.donnicolas.rfid.data.api

import com.donnicolas.rfid.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

class ApiClient(
    baseUrl: String,
    tokenProvider: () -> String?,
    /** URL viva (Wi‑Fi LAN). Permite cambiar el host sin reinstalar la APK. */
    urlProvider: () -> String = { baseUrl },
    /** Se invoca cuando la API responde 401 fuera del login (token vencido). */
    onUnauthorized: () -> Unit = {},
) {
    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val rewriteHostInterceptor = Interceptor { chain ->
        val target = urlProvider().toHttpUrlOrNull()
            ?: return@Interceptor chain.proceed(chain.request())
        val url = chain.request().url.newBuilder()
            .scheme(target.scheme)
            .host(target.host)
            .port(target.port)
            .build()
        chain.proceed(chain.request().newBuilder().url(url).build())
    }

    private val authInterceptor = Interceptor { chain ->
        val token = tokenProvider()
        val builder = chain.request().newBuilder()
            .header("X-Client", "mc33")
        val secret = BuildConfig.INVENTORY_CLIENT_SECRET
        if (secret.isNotBlank()) {
            builder.header("X-Inventory-Client-Secret", secret)
        }
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }
        chain.proceed(builder.build())
    }

    /**
     * Un 401 en cualquier endpoint que no sea el login significa token vencido o
     * revocado: hay que volver a autenticar en vez de seguir fallando operación
     * por operación con un mensaje de credenciales inválidas.
     */
    private val sessionExpiryInterceptor = Interceptor { chain ->
        val request = chain.request()
        val response = chain.proceed(request)
        val isLogin = request.url.encodedPath.endsWith("/auth/login")
        if (response.code == 401 && !isLogin) {
            onUnauthorized()
        }
        response
    }

    private val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .addInterceptor(rewriteHostInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(sessionExpiryInterceptor)
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            },
        )
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttp)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    val authApi: AuthApi = retrofit.create(AuthApi::class.java)
    val warehouseApi: WarehouseApi = retrofit.create(WarehouseApi::class.java)
    val inventoryApi: InventoryApi = retrofit.create(InventoryApi::class.java)
    val assetsApi: AssetsApi = retrofit.create(AssetsApi::class.java)
    val devicesApi: DevicesApi = retrofit.create(DevicesApi::class.java)
}
