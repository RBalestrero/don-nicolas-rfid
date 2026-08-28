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
| [ADRs](docs/adr/) | Registro de decisiones arquitectónicas |

## Estado del proyecto

> **Fase 0 — Fundación:** Plan de desarrollo y documentación completados.  
> **Próximo paso:** Aprobación del plan → inicialización de código (Fase 0.2+).

## Hardware soportado

- **Terminal móvil:** Zebra MC33R (RFID UHF RAIN, Android)
- **Impresoras RFID:** Zebra ZD621R, Zebra ZT411 (on-metal)
- **Etiquetas:** UHF EPC Gen2 V2 / ISO 18000-63

## Desarrollo

```bash
# Setup (cuando esté disponible)
make setup
make dev

# Tests
make test

# Lint
make lint
```

## Licencia

Proyecto privado — Don Nicolás / División RFID.
