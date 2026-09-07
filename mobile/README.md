# Don Nicolás RFID — App Android

App móvil Kotlin para operaciones de campo (Zebra MC33R).

## Fase actual

**3.2** — Integración RFID: lectura masiva de tags.

- Modo `SIMULATOR` (default): emulador/CI, >1000 EPCs únicos.
- Modo `ZEBRA`: stub listo para vincular el AAR del Zebra RFID SDK API3.

## Requisitos

- JDK 17+
- Android SDK (API 35)
- API Don Nicolás corriendo en `localhost:8000`

## Configuración

`local.properties` (no se versiona):

```
sdk.dir=C:\\Users\\<usuario>\\AppData\\Local\\Android\\Sdk
```

En `app/build.gradle.kts`:

- `API_BASE_URL` — emulador: `http://10.0.2.2:8000/api/v1/`
- `RFID_MODE` — `SIMULATOR` | `ZEBRA` | `AUTO`

## Comandos

```bash
cd mobile
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

Usuario seed: `admin@donnicolas.com` / `admin123`

## Flujo en app

Login → **Lectura masiva RFID** → Iniciar lectura / Detener / Limpiar
