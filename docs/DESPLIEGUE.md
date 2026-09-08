# Despliegue y hosting — Don Nicolás RFID

Cómo está armada la aplicación, qué se despliega hoy, y cómo hostearla para que **web + API + APK MC33 + PostgreSQL** funcionen juntas.

Complementa: [`PRODUCCION.md`](PRODUCCION.md) (checklist de seguridad/go-live) y [`.env.example`](../.env.example).

---

## 1. Cómo está estructurado el sistema

Son **tres clientes** y **un backend**, con una sola base de datos:

```
┌─────────────────────┐     HTTPS/HTTP      ┌──────────────────────┐
│  Web (React/Vite)   │ ──────────────────► │                      │
│  navegador PC       │                     │  API FastAPI         │
└─────────────────────┘                     │  /api/v1/...         │
                                            │                      │──► PostgreSQL
┌─────────────────────┐     HTTPS/HTTP      │  JWT + RBAC          │
│  APK Android MC33   │ ──────────────────► │  uploads (fotos)     │
│  inventarios RFID   │                     │                      │
└─────────────────────┘                     └──────────────────────┘
                                                      │
                                                      ▼ (red local, opcional)
                                               Impresora Zebra
```

| Pieza | Carpeta | Qué es | Cómo se “despliega” |
|-------|---------|--------|---------------------|
| **API** | `backend/` | FastAPI + Alembic | Proceso/container en un servidor (puerto 8000 detrás de proxy) |
| **Web** | `frontend/` | SPA React | Archivos estáticos (`npm run build` → `dist/`) servidos por nginx/Caddy, o Vite solo en desarrollo |
| **Móvil** | `mobile/` | APK Kotlin | Se **instala en cada MC33** (no se hostea en el servidor). Apunta por URL a la API |
| **DB** | Docker `postgres` | PostgreSQL 16 | Container o instancia administrada |
| **Infra compose** | `infra/docker-compose.yml` | Orquestación local | Hoy orientada a **desarrollo** (reload, Vite dev) |

### Responsabilidades

- **Web:** maestros (activos, depósitos), transferencias, dashboard, **auditoría** de inventarios, exportes.
- **MC33:** inventarios (iniciar / lecturas RFID / cerrar), sync offline, operaciones de campo.
- **API:** única fuente de verdad; ambos clientes hablan con ella.
- **PostgreSQL:** datos persistentes.

Sin API + DB accesibles desde la red del MC33 y de los PCs, nada funciona de punta a punta.

---

## 2. Desarrollo local (lo que usás ahora)

### Opción A — recomendada en Windows

1. PostgreSQL: `cd infra && docker compose up -d postgres`
2. API: `bash scripts/dev-api.sh` o uvicorn en `:8000`
3. Web: `cd frontend && npm run dev` → `:5174`
4. Migraciones: `cd backend && alembic upgrade head`
5. Admin seed: `python scripts/seed-admin.py` (si aplica)

| URL | Uso |
|-----|-----|
| http://localhost:5174 | Web |
| http://localhost:8000/api/v1/health | Health |
| http://localhost:8000/api/docs | Swagger (solo dev) |

La APK en emulador/dispositivo usa `BuildConfig.API_BASE_URL` (host de tu PC en la LAN, p. ej. `http://192.168.x.x:8000/api/v1/`).

### Opción B — todo con Compose

```bash
cd infra && docker compose up --build
```

Levanta `postgres` + `api` + `web` en modo **dev** (`--reload`, `npm run dev`).  
**No es la forma final de producción** (ver sección 3).

---

## 3. Hosting recomendado en producción / planta

### Topología mínima (una VM o servidor en la red de la planta)

```
Internet / LAN corporativa
        │
        ▼
┌───────────────────┐
│  Reverse proxy    │  :443 TLS (nginx / Caddy)
│  - app.dominio    │──► archivos estáticos del front (dist/)
│  - api.dominio    │──► uvicorn/gunicorn FastAPI :8000
└─────────┬─────────┘
          │ red interna
          ▼
   ┌────────────┐     ┌─────────────┐
   │ PostgreSQL │     │ Volumen     │
   │ (solo LAN) │     │ /uploads    │
   └────────────┘     └─────────────┘

MC33 (Wi‑Fi planta) ──HTTPS──► api.dominio
PC oficina          ──HTTPS──► app.dominio
```

### Qué hostear en el servidor

1. **PostgreSQL** (Docker volume o servicio gestionado).
2. **API** (Docker o systemd + venv), sin `--reload`, con `APP_ENV=production`.
3. **Front estático** (nginx sirve `frontend/dist`).
4. **Proxy TLS** delante de ambos.
5. **No** hace falta “hostear” la APK: se distribuye el `.apk` a los MC33 (USB, MDM, store interno).

### Ejemplo de flujo de deploy (manual)

```bash
# En el servidor (idea general)
git pull
cp .env.example .env   # solo la primera vez; completar secrets

# DB
cd infra && docker compose up -d postgres
cd ../backend && alembic upgrade head

# API (ejemplo sin compose prod todavía)
# exportar APP_ENV=production, SECRET_KEY, etc.
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2

# Web
cd ../frontend
# VITE_API_URL=https://api.tudominio.com/api/v1
npm ci && npm run build
# copiar dist/ al root del nginx del front
```

### Compose actual vs prod

| Aspecto | `infra/docker-compose.yml` (hoy) | Producción |
|---------|-----------------------------------|------------|
| API command | `uvicorn --reload` | sin reload; workers fijos |
| Web | `npm run dev` | `npm run build` + nginx |
| `API_DEBUG` | forzado `true` en compose | `false` |
| Volúmenes código | montan `src` para hot reload | imagen inmutable / sin bind mount de código |
| HTTPS | no | sí, en proxy |
| Puerto Postgres | publicado a host | preferible **sin** publicar a Internet |

Cuando armes un `docker-compose.prod.yml`, basate en el actual pero con esas diferencias (queda como tarea de infra; el checklist está en `PRODUCCION.md`).

---

## 4. Redes: lo crítico para el MC33

El terminal debe alcanzar la API por IP/DNS:

| Escenario | `API_BASE_URL` típica en la APK |
|-----------|----------------------------------|
| Misma LAN Wi‑Fi que el servidor | `https://api.empresa.local/api/v1/` o `http://192.168.1.10:8000/api/v1/` (solo si aún no hay TLS) |
| Emulador Android | `http://10.0.2.2:8000/api/v1/` |
| PC desarrollo | `http://<IP-de-tu-PC>:8000/api/v1/` |

Si el MC33 no puede hacer ping/HTTP a esa URL, inventarios y sync fallan aunque la web en tu PC “ande”.

La APK envía `X-Client: mc33` (obligatorio para writes de inventarios).

---

## 5. Orden de arranque (siempre)

1. PostgreSQL healthy  
2. Migraciones Alembic  
3. API (health `GET /api/v1/health` → `database: connected`)  
4. Front (build servido)  
5. Probar login web  
6. Instalar/actualizar APK y probar login + inventario  

---

## 6. Opciones de hosting (elige según IT)

| Opción | Cuándo | Notas |
|--------|--------|-------|
| **VM en planta / servidor on‑prem** | Caso típico Don Nicolás (RFID + impresoras LAN) | Mejor control de red MC33 ↔ API ↔ Zebra |
| **VPS cloud** (DigitalOcean, Azure, etc.) | Si la planta tiene buen enlace y VPN | MC33 necesita VPN o API pública con HTTPS y buen firewall |
| **Paas** (Railway, Render, Fly) | Prototipos | Cuidado con red hacia MC33 e impresoras locales |
| **Solo Docker Compose en un PC de planta** | Piloto | Aceptable corto plazo; agregar proxy TLS y backups |

Recomendación práctica inicial: **un servidor Linux en la red de la planta** + Docker (Postgres + API) + nginx (front + TLS) + APK instalada en los MC33.

---

## 7. Resumen “¿qué tengo que hostear?”

| Componente | ¿Hostear? | Dónde |
|------------|-----------|--------|
| PostgreSQL | Sí | Servidor / Docker |
| API FastAPI | Sí | Mismo servidor (interno + proxy) |
| Web React | Sí (archivos estáticos) | Mismo proxy/nginx |
| APK MC33 | No (instalar en dispositivos) | Cada terminal |
| Impresora Zebra | No (dispositivo de red) | LAN; la API le habla por TCP |

---

## 8. Referencias rápidas

| Tema | Doc / path |
|------|------------|
| Secrets, HTTPS checklist, roles | [`PRODUCCION.md`](PRODUCCION.md) |
| Variables | [`.env.example`](../.env.example) |
| Compose local | [`infra/docker-compose.yml`](../infra/docker-compose.yml) |
| Arquitectura funcional | [`ARQUITECTURA.md`](ARQUITECTURA.md) |
| Dev scripts | `scripts/dev-api.sh`, `scripts/dev-web.sh` |

Cuando definas el hosting concreto (IP, dominio, VPN), anotá acá la URL de API de prod y el procedimiento exacto de update (`git pull` / imagen Docker / reinicio) para el equipo de planta.
