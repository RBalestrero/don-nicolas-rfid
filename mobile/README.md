# Don Nicolás RFID — App Android

App móvil Kotlin para operaciones de campo (Zebra MC33xx).

## Fase actual

**3.2** — Lectura masiva RFID con Zebra RFID API3 real + simulador para CI.

## Hardware conectado

- Dispositivo: **MC3300x** (USB debugging)
- AAR: `app/libs/rfidapi3lib-2.0.5.292.aar` (HHSampleApp del SDK)
- Modo: `RFID_MODE=AUTO` → Zebra en MC33, Simulator en emulador/CI

## Deploy al MC33 por USB

```bash
# 1) API escuchando en la PC
bash scripts/dev-api.sh

# 2) Túnel USB para que el MC33 llegue a localhost:8000 de la PC
adb reverse tcp:8000 tcp:8000

# 3) Instalar
cd mobile
./gradlew installDebug
adb shell am start -n com.donnicolas.rfid/.MainActivity
```

Usuario: `admin@donnicolas.com` / `admin123`

## SDKs locales (no versionados)

Colocá extractos en `docs/sdk/` (gitignored):

- `docs/sdk/mc330u/Zebra_RFIDAPI3_SDK_...` → RFID handheld
- `docs/sdk/ZT411R/Link-OS_SDK/Webservices` → impresora

## Comandos

```bash
cd mobile
./gradlew testDebugUnitTest
./gradlew assembleDebug
```
