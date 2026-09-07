# Don Nicolás RFID — App Android

App móvil Kotlin para operaciones de campo (Zebra MC33R).

## Fase actual

**3.1** — Proyecto base + autenticación JWT contra la API.

## Requisitos

- JDK 17+
- Android SDK (API 35)
- API Don Nicolás corriendo en `localhost:8000`

## Configuración

`local.properties` (no se versiona):

```
sdk.dir=C:\\Users\\<usuario>\\AppData\\Local\\Android\\Sdk
```

Emulador usa `http://10.0.2.2:8000/api/v1/` para llegar al host.

Dispositivo físico: cambiar `API_BASE_URL` en `app/build.gradle.kts` a la IP de tu PC.

## Comandos

```bash
cd mobile
./gradlew test          # JUnit
./gradlew assembleDebug # APK debug
```

Usuario seed: `admin@donnicolas.com` / `admin123`
