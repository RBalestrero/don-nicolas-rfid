# Plan de Desarrollo — Sistema RFID Don Nicolás

> Versión: 1.0 | Fecha: 2026-08-28  
> Estado: **Aprobación pendiente** — No se escribirá código de aplicación hasta aprobar este plan.

---

## 1. Resumen ejecutivo

Este documento define el plan de desarrollo para el **Sistema RFID de Gestión de Activos, Inventario y Control de Stock Distribuido** del cliente Don Nicolás. El plan prioriza tecnologías probadas, mantenibles y adecuadas al alcance, evitando sobreingeniería.

**Principio rector:** aplicar la solución más simple que cumpla los requisitos, con capacidad de escalar cuando el negocio lo demande.

---

## 2. Stack tecnológico seleccionado

### 2.1 Justificación de la selección

| Capa | Tecnología | ¿Por qué? |
|------|------------|-----------|
| **Backend API** | Python 3.12 + **FastAPI** | Desarrollo rápido, tipado con Pydantic, documentación OpenAPI automática, excelente para APIs REST, amplio ecosistema de testing |
| **ORM / DB** | **SQLAlchemy 2** + **Alembic** + **PostgreSQL 16** | Modelo relacional natural para activos/depósitos/movimientos; PostgreSQL es robusto, gratuito y escalable |
| **Autenticación** | **JWT** + RBAC | Estándar de la industria, stateless, compatible con web y móvil |
| **Frontend Web** | **React 18** + **TypeScript** + **Vite** | Ecosistema maduro, tipado fuerte, ideal para dashboards administrativos |
| **UI Web** | **Tailwind CSS** + **shadcn/ui** | Componentes accesibles, diseño consistente, sin dependencia pesada |
| **App Móvil** | **Kotlin** + **Android SDK** (nativo) | El MC33R corre Android; Zebra provee RFID SDK nativo para Android — evita capas intermedias innecesarias |
| **Sincronización offline** | **Room** (SQLite local) + cola de sync | Patrón offline-first probado en entornos industriales |
| **Impresión RFID** | **ZPL** vía Zebra Link-OS SDK / socket | Protocolo estándar Zebra, sin middleware propietario adicional |
| **Contenedores** | **Docker** + **Docker Compose** | Entorno reproducible para desarrollo y despliegue |
| **CI/CD** | **GitHub Actions** | Integrado con el repositorio, sin costo adicional |
| **Testing Backend** | **pytest** + **httpx** | Estándar en ecosistema Python/FastAPI |
| **Testing Frontend** | **Vitest** + **React Testing Library** | Rápido, compatible con Vite |
| **Testing Móvil** | **JUnit 5** + **Espresso** | Estándar Android |
| **Linting** | **Ruff** (Python), **ESLint** (TS), **ktlint** (Kotlin) | Consistencia de código automatizada |

### 2.2 Tecnologías descartadas (y por qué)

| Tecnología descartada | Motivo |
|-----------------------|--------|
| Microservicios | El alcance no justifica la complejidad operativa; monolito modular es suficiente |
| Kubernetes | Overkill para despliegue inicial; Docker Compose cubre la etapa actual |
| MongoDB / NoSQL | El dominio es altamente relacional (activos ↔ ubicaciones ↔ movimientos) |
| React Native / Flutter | El SDK RFID de Zebra es nativo Android; un framework cross-platform agregaría complejidad sin beneficio |
| GraphQL | REST con OpenAPI es suficiente para web + móvil; menos curva de aprendizaje |
| Redis (fase inicial) | No hay requisito de caché en tiempo real en MVP; se evaluará en fase 2 si hay cuellos de botella |

---

## 3. Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTES                                 │
├──────────────┬──────────────────┬─────────────────────────┤
│  Web Admin   │  App Android     │  Impresora Zebra        │
│  (React)     │  (MC33R/Kotlin)  │  (ZD621R / ZT411)       │
└──────┬───────┴────────┬─────────┴──────────┬──────────────┘
       │  HTTPS/REST    │  HTTPS/REST         │  ZPL/TCP
       │                │  + Sync offline      │
       ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│              API REST — FastAPI (Monolito modular)           │
│  ┌─────────┬──────────┬───────────┬──────────┬───────────┐  │
│  │ Activos │ Depósitos│ Inventario│ Usuarios │ Reportes  │  │
│  └─────────┴──────────┴───────────┴──────────┴───────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Capa de servicios + repositorios              │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  PostgreSQL 16   │
                  └─────────────────┘
```

**Patrón arquitectónico:** Monolito modular con separación por dominios (bounded contexts). Cada módulo tiene su propio router, servicio y repositorio. Facilita evolución futura a microservicios si fuera necesario, sin pagar el costo desde el día uno.

---

## 4. Fases de desarrollo

### Fase 0 — Fundación (Semana 1-2)
> **Estado actual: EN CURSO**

| # | Tarea | Entregable | Tests |
|---|-------|------------|-------|
| 0.1 | Plan de desarrollo y documentación | Este documento + README | Revisión manual |
| 0.2 | Repositorio GitHub + CI básico | Repo configurado, Actions lint | Pipeline verde |
| 0.3 | Docker Compose (API + PostgreSQL) | `docker-compose.yml` funcional | Health check API responde 200 |
| 0.4 | Esquema DB inicial (migraciones) | Migración Alembic v001 | Test de conexión y migración |

### Fase 1 — Módulo de Activos (Semana 3-5)

| # | Tarea | Entregable | Tests |
|---|-------|------------|-------|
| 1.1 | CRUD de activos + categorías | Endpoints REST documentados | pytest: crear, leer, actualizar, eliminar |
| 1.2 | Gestión de usuarios y roles (RBAC) | Login JWT + middleware de permisos | pytest: acceso autorizado/denegado |
| 1.3 | Carga de fotografías | Upload a almacenamiento local/S3 | pytest: upload + validación de formato |
| 1.4 | Historial de activo (auditoría) | Registro automático de cambios | pytest: verificar trail de auditoría |
| 1.5 | Integración impresora Zebra (ZPL) | Servicio de impresión RFID | Test de integración con impresora/simulador |
| 1.6 | UI Web: pantallas de alta de activos | Formularios React funcionales | Vitest: renderizado + submit |

### Fase 2 — Módulo de Depósitos (Semana 6-7)

| # | Tarea | Entregable | Tests |
|---|-------|------------|-------|
| 2.1 | CRUD depósitos, sectores, ubicaciones | Endpoints REST jerárquicos | pytest: jerarquía depósito→sector→ubicación |
| 2.2 | Asignación activo ↔ ubicación | Endpoint de asignación | pytest: asignar y consultar stock |
| 2.3 | Consulta de stock por depósito | Endpoint con filtros | pytest: stock correcto tras movimientos |
| 2.4 | UI Web: gestión de depósitos | Pantallas de administración | Vitest: CRUD UI |

### Fase 3 — Inventario Móvil (Semana 8-11)

| # | Tarea | Entregable | Tests |
|---|-------|------------|-------|
| 3.1 | App Android: proyecto base + auth | Login contra API | JUnit: autenticación |
| 3.2 | Integración Zebra RFID SDK | Lectura masiva de tags | Test en dispositivo MC33R |
| 3.3 | Inventario masivo (esperado vs leído) | Flujo completo de inventario | JUnit + test E2E en dispositivo |
| 3.4 | Detección faltantes/sobrantes | Reporte post-inventario | pytest + JUnit: escenarios de discrepancia |
| 3.5 | Búsqueda de activo por RFID | Pantalla de búsqueda | Test en dispositivo |
| 3.6 | Modo offline + sincronización | Room DB + cola de sync | JUnit: operación offline → sync online |

### Fase 4 — Transferencias y Reportes (Semana 12-14)

| # | Tarea | Entregable | Tests |
|---|-------|------------|-------|
| 4.1 | Transferencias entre depósitos | Flujo con confirmación RFID | pytest + JUnit: transferencia completa |
| 4.2 | Historial de movimientos | Endpoint con filtros y paginación | pytest: trazabilidad completa |
| 4.3 | Dashboard gerencial | KPIs: stock, movimientos, discrepancias | Vitest: renderizado de métricas |
| 4.4 | Reportes exportables (PDF/Excel) | Generación de reportes | pytest: formato y contenido |

### Fase 5 — Hardening y Despliegue (Semana 15-16)

| # | Tarea | Entregable | Tests |
|---|-------|------------|-------|
| 5.1 | Pruebas de carga (inventario masivo) | Informe de rendimiento | Benchmark: > 1000 tags procesados |
| 5.2 | Seguridad (OWASP top 10) | Auditoría de seguridad | Checklist OWASP |
| 5.3 | Documentación de despliegue | Manual de instalación | Verificación en entorno staging |
| 5.4 | Capacitación y entrega | Manual de usuario | Aceptación del cliente |

---

## 5. Procedimientos de desarrollo

### 5.1 Flujo Git (Git Flow simplificado)

```
main ─────────────────────────────────────────────► (producción)
  │
  └── develop ────────────────────────────────────► (integración)
        │
        ├── feature/M1-alta-activos
        ├── feature/M2-depositos
        └── fix/descripcion-bug
```

**Reglas:**
- `main` siempre desplegable; protegida con PR obligatorio
- `develop` es rama de integración
- Features: `feature/<fase>-<descripcion-corta>`
- Fixes: `fix/<descripcion-corta>`
- Commits en español, formato: `tipo(alcance): descripción` (Conventional Commits)
  - Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

### 5.2 Definición de "Done" (DoD)

Una tarea se considera terminada cuando:

- [ ] Código implementado siguiendo convenciones del proyecto
- [ ] Tests de funcionalidad escritos y pasando (cobertura ≥ 80% en lógica de negocio)
- [ ] Documentación actualizada (API, README, o docstring según corresponda)
- [ ] Lint sin errores
- [ ] PR revisado y mergeado a `develop`
- [ ] Sin regresiones en CI

### 5.3 Proceso de testing obligatorio

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Unit Tests  │────►│ Integration  │────►│   E2E /      │
│  (pytest,    │     │ Tests (API + │     │  Manual en   │
│   JUnit)     │     │  DB)         │     │  hardware    │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Antes de cada implementación:**
1. Escribir test que describa el comportamiento esperado (TDD cuando sea posible)
2. Implementar la funcionalidad
3. Verificar que todos los tests pasan (`make test` o equivalente)
4. Verificar lint (`make lint`)

**Ningún PR se mergea sin tests verdes en CI.**

### 5.4 Convenciones de código

| Área | Convención |
|------|------------|
| Python | PEP 8, tipado estricto, docstrings Google style |
| TypeScript | ESLint recommended + Prettier |
| Kotlin | Kotlin Coding Conventions + ktlint |
| SQL | snake_case, nombres en español para tablas de dominio |
| API REST | kebab-case en URLs, camelCase en JSON, versionado `/api/v1/` |
| Commits | Conventional Commits en español |

### 5.5 Documentación obligatoria

| Documento | Ubicación | Cuándo actualizar |
|-----------|-----------|-------------------|
| Plan de desarrollo | `docs/PLAN_DESARROLLO.md` | Cambios de alcance o fases |
| Requisitos | `docs/REQUISITOS.md` | Nuevos requisitos del cliente |
| Arquitectura | `docs/ARQUITECTURA.md` | Cambios estructurales |
| API | Auto-generada (OpenAPI/Swagger) | Cada endpoint nuevo |
| Manual de despliegue | `docs/DESPLIEGUE.md` | Fase 5 |
| Manual de usuario | `docs/MANUAL_USUARIO.md` | Fase 5 |
| ADRs (decisiones) | `docs/adr/` | Decisiones técnicas relevantes |

---

## 6. Entornos

| Entorno | Propósito | Infraestructura |
|---------|-----------|-----------------|
| **Local** | Desarrollo individual | Docker Compose |
| **Staging** | Pruebas de integración y UAT | Servidor del cliente o VPS |
| **Producción** | Operación real | Servidor del cliente |

Variables de entorno gestionadas con `.env` (nunca commiteadas). Template en `.env.example`.

---

## 7. Riesgos identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| SDK Zebra no disponible para pruebas sin hardware | Alta | Alto | Simulador ZPL + dispositivo de prueba en oficina |
| Conectividad intermitente en depósitos remotos | Alta | Medio | Modo offline-first desde Fase 3 |
| Volumen masivo de tags en inventario | Media | Medio | Procesamiento batch + índices DB optimizados |
| Cambio de alcance del cliente | Media | Alto | Documentar requisitos, cambios vía ADR |

---

## 8. Criterios de aceptación del MVP

El MVP se considera entregable cuando:

1. Se puede registrar un activo, imprimir su etiqueta RFID y consultarlo
2. Se pueden crear depósitos con ubicaciones y asignar activos
3. Se puede realizar un inventario masivo con el MC33R (online y offline)
4. Se detectan faltantes y sobrantes automáticamente
5. Se pueden transferir activos entre depósitos con trazabilidad
6. Existe un dashboard web con stock y movimientos recientes
7. Todos los tests de funcionalidad pasan en CI
8. Documentación de despliegue y uso disponible

---

## 9. Próximos pasos (post-aprobación)

1. Aprobar este plan con el equipo/cliente
2. Crear repositorio en GitHub y configurar protección de ramas
3. Inicializar estructura de carpetas (Fase 0.2)
4. Configurar Docker Compose y primera migración (Fase 0.3-0.4)
5. Comenzar Fase 1 con TDD en CRUD de activos

---

> **Nota:** Este plan no incluye código de aplicación. Su aprobación es prerequisito para iniciar la implementación.
