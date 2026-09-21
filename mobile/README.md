# Don Nicolás RFID — App Android

App móvil Kotlin para operaciones de campo (Zebra MC33xx).

## Conexión API desde el MC33

En esta red **ESET bloquea el TCP 8000** hacia la PC (el ping al Wi‑Fi funciona, el HTTP da timeout).
La vía estable es un **túnel ADB** a `127.0.0.1:8000`. El USB se puede desconectar después.

### Setup (una vez por sesión / reboot del MC33)

1. API en la PC: `bash scripts/dev-api.sh`
2. Conectá el MC33 por USB **una vez** (o si ADB TCP ya está activo):

```bash
bash scripts/adb-wifi-api.sh 192.168.100.91
```

3. En el login de la APK, **Servidor (IP Wi‑Fi)** = `127.0.0.1`

Podés desconectar el USB: el túnel sigue por Wi‑Fi mientras ADB TCP (`:5555`) esté vivo.

### Si ESET permite el puerto 8000

En ESET → Protección de red → Firewall → Reglas:

- Dirección: **entrada**
- Protocolo: TCP, puerto **8000**
- Remoto: `192.168.100.0/24`
- Acción: **permitir**
- Aplicación: `python.exe` (o cualquiera)

Entonces en el login usá la IP Wi‑Fi de la PC, p. ej. `192.168.100.158`, **sin** túnel ADB.

## Flujo inventario

1. Login → **Inventario** → depósito
2. Leer RFID → contadores esperado/encontrado/faltante/sobrante
3. **Cerrar inventario**
