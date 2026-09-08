# Sistema RFID — Don Nicolás

Solución integral de identificación y trazabilidad mediante tecnología **RFID UHF** para gestión de activos, inventario y control de stock distribuido en múltiples depósitos.

## Módulos

| Módulo | Descripción |
|--------|-------------|
| **Alta de Activos** | Registro, categorización, fotografías e impresión de etiquetas RFID |
| **Depósitos** | Administración de depósitos, sectores y ubicaciones |
| **Inventario Móvil** | Inventario masivo con terminal Zebra MC33R (online/offline) |
| **Transferencias** | Traslado de activos entre depósitos con trazabilidad RFID |

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy, PostgreSQL 16 |
| Frontend Web | React 18, TypeScript, Vite, Tailwind CSS |
| App Móvil | Kotlin, Android SDK, Zebra RFID SDK |
| Infraestructura | Docker, Docker Compose, GitHub Actions |

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [Plan de Desarrollo](docs/PLAN_DESARROLLO.md) | Fases, tecnologías, procedimientos y criterios de aceptación |
| [Requisitos](docs/REQUISITOS.md) | Requisitos funcionales y no funcionales |
| [Arquitectura](docs/ARQUITECTURA.md) | Diagramas, módulos, flujos y seguridad |
| [Estructura del Proyecto](docs/ESTRUCTURA_PROYECTO.md) | Árbol de directorios y convenciones |
| [Producción / go-live](docs/PRODUCCION.md) | Checklist de variables, HTTPS, roles, backups y pendientes al salir a prod |
| [ADRs](docs/adr/) | Registro de decisiones arquitectónicas |
| [Configuración GitHub](docs/GITHUB_SETUP.md) | Autenticación `gh`, push y scope `workflow` |

## Estado del proyecto

> **Fase 1.5:** Impresión de etiquetas RFID vía ZPL (Zebra).

## Hardware soportado

- **Terminal móvil:** Zebra MC33R (RFID UHF RAIN, Android)
- **Impresoras RFID:** Zebra ZD621R, Zebra ZT411 (on-metal)
- **Etiquetas:** UHF EPC Gen2 V2 / ISO 18000-63

## Desarrollo con hot reload

### Opción recomendada — más rápida (Windows)

```bash
bash scripts/setup-dev.sh   # solo la primera vez
```

Levantar PostgreSQL:

```bash
cd infra && docker compose up -d postgres
```

En **dos terminales separadas**:

```bash
# Terminal 1 — API con reload automático
cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Vite HMR (cambios instantáneos)
cd frontend && npm run dev
```

| URL | Descripción |
|-----|-------------|
| http://localhost:5174 | Preview web Don Nicolás (hot reload) |
| http://localhost:8000/api/docs | Documentación API (Swagger) |
| http://localhost:8000/api/v1/health | Health check |

### Opción Docker — todo en contenedores

```bash
cd infra && docker compose up --build
```

Detener: `cd infra && docker compose down`

### Tests

```bash
cd backend && python -m pytest -v
cd frontend && npm test
```

## Licencia

Proyecto privado — Don Nicolás / División RFID.
