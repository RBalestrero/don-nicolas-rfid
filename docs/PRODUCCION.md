# Checklist de producción — Don Nicolás RFID

Documento operativo para cuando el sistema pase de desarrollo/LAN a un entorno de **producción** (o staging serio).  
No hace falta aplicar todo hoy: usalo como guía al momento del despliegue.

Relacionado: `.env.example`, `backend/app/config.py` (`validate_security_settings`), reglas Cursor `seguridad-rbac.mdc` e `inventarios-mc33.mdc`.

---

## 1. Variables de entorno obligatorias

Copiá `.env.example` a `.env` (o al secret store del host) y ajustá:

| Variable | Desarrollo (hoy) | Producción (debe quedar) |
|----------|------------------|---------------------------|
| `APP_ENV` | `development` | `production` |
| `API_DEBUG` | `true` | `false` |
| `SECRET_KEY` | valor de ejemplo / corto | **≥ 32 caracteres**, aleatoria, única. Nunca `dev-secret-…` ni `changeme` |
| `POSTGRES_PASSWORD` | `changeme` | Contraseña fuerte; rotar si estuvo en repos o chats |
| `POSTGRES_HOST` / `POSTGRES_DB` / `POSTGRES_USER` | localhost | Host/credenciales del servidor real |
| `CORS_ORIGINS` | `localhost:5173/5174` | Solo orígenes HTTPS reales del front (sin `*`) |
| `EXPOSE_API_DOCS` | (vacío = docs ON) | Dejar vacío o `false` (docs **OFF** por defecto en prod) |
| `VITE_API_URL` | `http://localhost:8000/api/v1` | URL HTTPS pública/interna de la API |
| `ZEBRA_PRINTER_SIMULATE` | `true` | `false` si hay impresora real; host/puerto correctos |
| `UPLOAD_DIR` | `./uploads` | Ruta persistente con backup (volumen Docker o disco) |

Con `APP_ENV=production` la API **no arranca** si `SECRET_KEY`, `API_DEBUG` o `POSTGRES_PASSWORD` son inseguros (`validate_security_settings`).

### Generar `SECRET_KEY` (ejemplo)

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 2. HTTPS y red (pendiente de infra)

La app hoy asume HTTP en LAN. En producción:

1. Poner **reverse proxy** (nginx, Caddy, Traefik o el del hosting) delante de API (`:8000`) y opcionalmente del front estático.
2. Terminar **TLS** en el proxy (certificado válido).
3. Redirigir HTTP → HTTPS.
4. Opcional: enviar header `Strict-Transport-Security` (HSTS) desde el proxy.
5. No exponer PostgreSQL a Internet; solo red interna.
6. Firewall: solo 443 (y 80 para redirect) hacia el proxy.

Sin HTTPS no se cumple NFR de seguridad del proyecto (`docs/REQUISITOS.md`).

---

## 3. OpenAPI / Swagger

En producción las docs quedan **deshabilitadas** salvo que fuerces `EXPOSE_API_DOCS=true` (no recomendado en Internet).

| Entorno | `/api/docs`, `/api/redoc`, `/api/openapi.json` |
|---------|-----------------------------------------------|
| `APP_ENV=development` | Disponibles |
| `APP_ENV=production` | Ocultos por defecto |

Si necesitás docs en staging interno: `EXPOSE_API_DOCS=true` + acceso solo por VPN/IP allowlist.

---

## 4. Roles y usuarios reales

RBAC ya está en la API. Antes de go-live:

1. Crear usuarios con roles correctos (no compartir el admin de desarrollo).
2. Cambiar / no reutilizar passwords de seed o demos.
3. Mapa rápido:

| Rol | Uso típico |
|-----|------------|
| `admin` | Administración total |
| `operador_alta` | Alta de activos, fotos, etiquetas, asignación |
| `operador_deposito` | Depósitos, transferencias, inventarios en MC33 |
| `supervisor` | Consulta / auditoría; puede cancelar transferencias |

4. **Inventarios:** conteo solo desde APK MC33 (`X-Client: mc33`). La web es auditoría. Verificar build de APK apuntando a la API de prod.

---

## 5. Frontend web

1. Build de producción: `cd frontend && npm run build`.
2. Servir `frontend/dist` con nginx/Caddy (o el mismo proxy).
3. `VITE_API_URL` debe ser la URL **final** HTTPS (se embebe en el build).
4. Opcional: `VITE_API_TIMEOUT_MS` (default 20000).
5. Pendiente de producto (no bloquea go-live técnico): **ocultar en UI** botones que el rol no puede usar (la API ya responde 403).

---

## 6. App móvil (MC33)

1. Configurar base URL de la API de producción (HTTPS).
2. Confirmar que el cliente envía `X-Client: mc33` (ya lo hace `ApiClient`).
3. Probar login, sync offline e inventario de punta a punta contra prod/staging.
4. Firmar el APK con keystore de release (no debug).

---

## 7. Base de datos y backups

1. Ejecutar migraciones Alembic contra la DB de prod:  
   `cd backend && alembic upgrade head`
2. Política de backup automático de PostgreSQL (diario + retención).
3. Probar restore en un entorno de prueba.
4. Volumen persistente para `UPLOAD_DIR` (fotos).

---

## 8. Rate limit y operación

Ya activos en proceso (memoria del worker):

- Login: límite por IP + lockout tras fallos.
- API: límite general por IP.

En producción multi-worker / multi-nodo, valorar más adelante:

- Rate limit compartido (Redis) si hay varias réplicas.
- Logs centralizados (sin loguear passwords ni tokens).
- Alertas sobre 401/429/5xx.

---

## 9. Checklist rápido pre-salida

- [ ] `APP_ENV=production`
- [ ] `API_DEBUG=false`
- [ ] `SECRET_KEY` fuerte generada y guardada fuera del repo
- [ ] `POSTGRES_PASSWORD` fuerte; DB no pública
- [ ] `CORS_ORIGINS` solo dominios reales
- [ ] HTTPS en proxy; health check OK por HTTPS
- [ ] Docs OpenAPI no públicas
- [ ] Migraciones aplicadas
- [ ] Backup DB + uploads configurado
- [ ] Usuarios/roles reales creados; admin demo deshabilitado o password rotado
- [ ] Front build con `VITE_API_URL` de prod
- [ ] APK MC33 apunta a prod y prueba inventario + sync
- [ ] Impresora: `ZEBRA_PRINTER_SIMULATE=false` si aplica
- [ ] Prueba de login fallido (lockout) y de 403 por rol

---

## 10. Qué ya está hecho en código (no rehacer)

- JWT + bcrypt, token corto
- Headers de seguridad HTTP básicos
- Rate limit / lockout de login
- Timeout de fetch en web; limpieza de sesión en 401
- Validación de inputs (password/EPC/tamaño de body)
- RBAC en writes
- Inventarios write solo con cliente MC33
- Arranque que falla si la config de prod es insegura

---

## 11. Referencias en el repo

| Archivo | Qué mirar |
|---------|-----------|
| `.env.example` | Plantilla de variables |
| `backend/app/config.py` | `validate_security_settings`, `docs_enabled` |
| `backend/app/core/rbac.py` | Matriz de roles |
| `backend/app/core/security_middleware.py` | Rate limit y headers |
| `docs/REQUISITOS.md` | NFR de seguridad |
| `docs/ARQUITECTURA.md` | Visión auth/RBAC |

Cuando despliegues, actualizá este doc si cambiás el procedimiento (hosting concreto, nombres de servicios Docker, etc.).
