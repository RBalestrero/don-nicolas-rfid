import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// Wi‑Fi: api.host=<IP-LAN-de-la-PC> en mobile/local.properties
// USB:   api.host=127.0.0.1 + adb reverse tcp:8000 tcp:8000
// Emulador: api.host=10.0.2.2
val apiHost: String = (
    project.findProperty("API_HOST") as String?
        ?: localProps.getProperty("api.host")
        ?: "192.168.100.164"
).trim()
val apiScheme: String = (
    project.findProperty("API_SCHEME") as String?
        ?: localProps.getProperty("api.scheme")
        ?: "http"
).trim()
val apiBaseUrl = "$apiScheme://$apiHost:8000/api/v1/"
// Con api.scheme=http el APK de release también necesita permiso de cleartext:
// sin esto todas las llamadas fallan con "Cleartext HTTP traffic not permitted".
val usesCleartext = apiScheme.equals("http", ignoreCase = true)
if (usesCleartext) {
    logger.lifecycle(
        "[don-nicolas] api.scheme=http → se habilita cleartext en todos los build types. " +
            "Para producción configurá api.scheme=https en mobile/local.properties.",
    )
}
val inventoryClientSecret: String = (
    project.findProperty("INVENTORY_CLIENT_SECRET") as String?
        ?: localProps.getProperty("inventory.client.secret")
        ?: ""
).trim()

android {
    namespace = "com.donnicolas.rfid"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.donnicolas.rfid"
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "API_HOST", "\"$apiHost\"")
        buildConfigField("String", "INVENTORY_CLIENT_SECRET", "\"$inventoryClientSecret\"")
        // SIMULATOR | ZEBRA | AUTO (AUTO usa Zebra en MC33xx)
        buildConfigField("String", "RFID_MODE", "\"AUTO\"")

        manifestPlaceholders["usesCleartextTraffic"] = usesCleartext.toString()
        manifestPlaceholders["networkSecurityConfig"] = if (usesCleartext) {
            "@xml/network_security_config_cleartext"
        } else {
            "@xml/network_security_config"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // En release preferí HTTPS (api.scheme=https en local.properties / CI).
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            buildConfigField("String", "RFID_MODE", "\"AUTO\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar", "*.jar"))))

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    val room = "2.6.1"
    implementation("androidx.room:room-runtime:$room")
    implementation("androidx.room:room-ktx:$room")
    ksp("androidx.room:room-compiler:$room")

    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
    testImplementation("org.mockito:mockito-inline:5.2.0")
}
