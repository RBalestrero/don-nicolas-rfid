# Estructura del Proyecto — Don Nicolás RFID

> Versión: 1.0 | Fecha: 2026-08-28

## Árbol de directorios

```
don-nicolas-rfid/
│
├── .github/
│   └── workflows/
│       ├── ci-backend.yml          # Lint + tests Python
│       ├── ci-frontend.yml         # Lint + tests React
│       └── ci-mobile.yml           # Lint + tests Android (fase 3)
│
├── backend/                        # API REST — FastAPI
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # Punto de entrada FastAPI
│   │   ├── config.py               # Configuración (env vars)
│   │   ├── database.py             # Conexión SQLAlchemy
│   │   ├── dependencies.py         # Inyección de dependencias
│   │   │
│   │   ├── modules/                # Módulos de dominio
│   │   │   ├── auth/
│   │   │   │   ├── router.py
│   │   │   │   ├── schemas.py
│   │   │   │   ├── service.py
│   │   │   │   ├── repository.py
│   │   │   │   └── models.py
│   │   │   ├── assets/
│   │   │   ├── warehouses/
│   │   │   ├── inventory/
│   │   │   ├── transfers/
│   │   │   └── reports/
│   │   │
│   │   ├── core/                   # Utilidades transversales
│   │   │   ├── security.py         # JWT, hashing
│   │   │   ├── exceptions.py       # Excepciones HTTP custom
│   │   │   ├── middleware.py       # CORS, logging, rate limit
│   │   │   └── pagination.py
│   │   │
│   │   └── integrations/           # Integraciones externas
│   │       └── zebra/
│   │           ├── zpl_generator.py
│   │           └── printer_client.py
│   │
│   ├── alembic/                    # Migraciones de base de datos
│   │   ├── versions/
│   │   └── env.py
│   │
│   ├── tests/                      # Tests del backend
│   │   ├── conftest.py             # Fixtures compartidos
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   │
│   ├── alembic.ini
│   ├── pyproject.toml              # Dependencias y config (Ruff, pytest)
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/                       # Web Admin — React + TypeScript
│   ├── public/
│   ├── src/
│   │   ├── main.tsx                # Entry point
│   │   ├── App.tsx
│   │   ├── api/                    # Cliente HTTP (axios/fetch)
│   │   │   └── client.ts
│   │   ├── components/             # Componentes reutilizables
│   │   │   ├── ui/                 # shadcn/ui components
│   │   │   └── layout/
│   │   ├── features/               # Módulos por funcionalidad
│   │   │   ├── auth/
│   │   │   ├── assets/
│   │   │   ├── warehouses/
│   │   │   ├── inventory/
│   │   │   ├── transfers/
│   │   │   └── dashboard/
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── stores/                 # Estado global (Zustand)
│   │   ├── types/                  # Tipos TypeScript
│   │   └── utils/
│   │
│   ├── tests/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── Dockerfile
│
├── mobile/                         # App Android — Kotlin
│   ├── app/
│   │   └── src/
│   │       ├── main/
│   │       │   ├── java/com/donnicolas/rfid/
│   │       │   │   ├── MainActivity.kt
│   │       │   │   ├── di/              # Inyección (Hilt)
│   │       │   │   ├── data/
│   │       │   │   │   ├── api/         # Retrofit client
│   │       │   │   │   ├── local/       # Room DB
│   │       │   │   │   ├── repository/
│   │       │   │   │   └── sync/        # Cola de sincronización
│   │       │   │   ├── domain/
│   │       │   │   │   ├── model/
│   │       │   │   │   └── usecase/
│   │       │   │   ├── ui/
│   │       │   │   │   ├── auth/
│   │       │   │   │   ├── inventory/
│   │       │   │   │   ├── search/
│   │       │   │   │   └── transfer/
│   │       │   │   └── rfid/            # Wrapper Zebra SDK
│   │       │   └── res/
│   │       └── test/                    # JUnit tests
│   │
│   ├── build.gradle.kts
│   └── settings.gradle.kts
│
├── docs/                           # Documentación del proyecto
│   ├── PLAN_DESARROLLO.md
│   ├── REQUISITOS.md
│   ├── ARQUITECTURA.md
│   ├── ESTRUCTURA_PROYECTO.md       # Este archivo
│   ├── DESPLIEGUE.md               # (Fase 5)
│   ├── MANUAL_USUARIO.md           # (Fase 5)
│   ├── adr/                        # Architecture Decision Records
│   │   └── 001-monolito-modular.md
│   └── Propuesta de proyecto V002 TECNICA (1).docx
│
├── infra/                          # Infraestructura
│   ├── docker-compose.yml          # Desarrollo local
│   ├── docker-compose.prod.yml     # Producción
│   └── nginx/
│       └── nginx.conf
│
├── scripts/                        # Scripts de utilidad
│   ├── setup-dev.sh                # Setup entorno de desarrollo
│   ├── run-tests.sh                # Ejecutar todos los tests
│   └── seed-data.py                # Datos de prueba
│
├── .gitignore
├── .env.example                    # Variables de entorno (template)
├── Makefile                        # Comandos frecuentes
├── README.md
└── LICENSE
```

## Convenciones por capa

### Backend (Python/FastAPI)

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Archivos | snake_case | `asset_service.py` |
| Clases | PascalCase | `AssetService` |
| Funciones | snake_case | `create_asset()` |
| Constantes | UPPER_SNAKE | `MAX_FILE_SIZE` |
| Tablas DB | snake_case español | `activos`, `depositos` |
| Endpoints | kebab-case, plural | `/api/v1/assets` |

### Frontend (TypeScript/React)

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Componentes | PascalCase | `AssetForm.tsx` |
| Hooks | camelCase con `use` | `useAssets()` |
| Archivos util | camelCase | `formatDate.ts` |
| Tipos/Interfaces | PascalCase | `Asset`, `CreateAssetDto` |
| Carpetas feature | kebab-case | `features/assets/` |

### Mobile (Kotlin)

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Clases | PascalCase | `InventoryViewModel` |
| Funciones | camelCase | `startRfidScan()` |
| Paquetes | lowercase | `com.donnicolas.rfid` |
| Layouts XML | snake_case | `activity_inventory.xml` |
| Recursos | snake_case | `ic_rfid_scan` |

## Comandos principales (Makefile)

```makefile
make setup          # Instalar dependencias de todos los módulos
make dev            # Levantar entorno de desarrollo (Docker Compose)
make test           # Ejecutar todos los tests
make test-backend   # Solo tests del backend
make test-frontend  # Solo tests del frontend
make lint           # Lint en todos los módulos
make migrate        # Ejecutar migraciones de DB
make seed           # Cargar datos de prueba
```

## Reglas de organización

1. **Un módulo = un dominio de negocio.** No mezclar lógica de activos con depósitos.
2. **Tests junto a su módulo** en backend (`tests/unit/assets/`), o en carpeta `tests/` dedicada.
3. **Sin lógica de negocio en routers/controllers.** Solo validación de entrada y delegación al service.
4. **Sin acceso directo a DB desde services.** Siempre a través de repositories.
5. **Configuración solo via variables de entorno.** Nunca hardcodear URLs, credenciales o puertos.
6. **Documentar endpoints con docstrings** — FastAPI genera OpenAPI automáticamente.
