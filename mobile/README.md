# Don Nicolás RFID — App Android

App móvil Kotlin para operaciones de campo (Zebra MC33xx).

## Conexión API (MC33 en Wi‑Fi)

En esta red el TCP al puerto **8000** de la PC queda bloqueado (ping OK, HTTP timeout).
La solución estable es un **túnel ADB por Wi‑Fi** hacia `127.0.0.1:8000`.

### Setup (una vez por sesión / reboot del MC33)

1. API en la PC: `bash scripts/dev-api.sh`
2. Conectá el MC33 por USB **una vez** (o si ya tiene ADB TCP activo):

```bash
bash scripts/adb-wifi-api.sh 192.168.100.91
```

3. En `mobile/local.properties`:

```properties
api.host=127.0.0.1
```

4. Instalá la app:

```bash
cd mobile && ./gradlew installDebug
```

En login debería verse `API: 127.0.0.1:8000`.

Podés desconectar el USB: el túnel sigue por Wi‑Fi mientras el ADB TCP (`:5555`) esté activo.

### Si la red permite TCP 8000 directo

```properties
api.host=192.168.100.164
```

sin `adb reverse`.

## Flujo inventario

1. Login → **Inventario masivo** → depósito
2. Leer RFID → contadores esperado/encontrado/faltante/sobrante
3. **Cerrar inventario**

Usuario: `admin@donnicolas.com` / `admin123`
