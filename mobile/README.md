# Don Nicolás RFID — App Android

App móvil Kotlin para operaciones de campo (Zebra MC33xx).

## Fase actual

**3.3** — Inventario masivo (esperado vs leído) en app + API.

## Conexión API por Wi‑Fi (recomendado)

El MC33 y la PC deben estar en la **misma red Wi‑Fi**. No hace falta USB ni `adb reverse`.

1. En la PC, anotá la IP LAN (`ipconfig` → IPv4, ej. `192.168.100.164`).
2. En `mobile/local.properties`:

```properties
api.host=192.168.100.164
```

3. API escuchando en todas las interfaces (`scripts/dev-api.sh` ya usa `--host 0.0.0.0`).
4. Firewall Windows: puerto **8000** TCP entrante (regla "Don Nicolas API 8000").
5. Rebuild e install:

```bash
cd mobile
./gradlew installDebug
```

En Home debería verse `API: 192.168.100.164:8000`.

### Alternativas

| Modo | `api.host` | Extra |
|------|------------|--------|
| Wi‑Fi / cuna | IP LAN de la PC | Misma red |
| USB debug | `127.0.0.1` | `adb reverse tcp:8000 tcp:8000` |
| Emulador | `10.0.2.2` | — |

## Flujo inventario

1. Login
2. **Inventario masivo** → elegir depósito
3. Leer RFID
4. Contadores: esperado / encontrado / faltante / sobrante
5. **Cerrar inventario**

## Hardware

- Dispositivo: **MC3300x**
- AAR: `app/libs/rfidapi3lib-2.0.5.292.aar`
- Modo: `RFID_MODE=AUTO`

Usuario: `admin@donnicolas.com` / `admin123`

## Comandos

```bash
cd mobile
./gradlew testDebugUnitTest
./gradlew assembleDebug
```
