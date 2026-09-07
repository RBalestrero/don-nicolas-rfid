# Don Nicolás RFID — App Android

App móvil Kotlin para operaciones de campo (Zebra MC33xx).

## Fase actual

**3.3** — Inventario masivo (esperado vs leído) en app + API.

## Flujo inventario

1. Login
2. **Inventario masivo** → elegir depósito
3. Leer RFID (gatillo o botón)
4. Contadores en vivo: esperado / encontrado / faltante / sobrante
5. **Cerrar inventario** → sync a API y detalle

## Hardware

- Dispositivo: **MC3300x** (USB debugging)
- AAR: `app/libs/rfidapi3lib-2.0.5.292.aar`
- Modo: `RFID_MODE=AUTO` → Zebra en MC33, Simulator en CI

## Deploy al MC33 por USB

```bash
bash scripts/dev-api.sh
adb reverse tcp:8000 tcp:8000
cd mobile
./gradlew installDebug
adb shell am start -n com.donnicolas.rfid/.MainActivity
```

Usuario: `admin@donnicolas.com` / `admin123`

## Comandos

```bash
cd mobile
./gradlew testDebugUnitTest
./gradlew assembleDebug
```
