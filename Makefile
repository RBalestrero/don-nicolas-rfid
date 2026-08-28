.PHONY: setup dev dev-fast dev-stop test test-backend test-frontend lint help

help: ## Mostrar ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Instalar dependencias (backend + frontend)
	@bash scripts/setup-dev.sh

dev: ## Levantar todo con Docker (hot reload en API y web)
	@[ -f .env ] || cp .env.example .env
	cd infra && docker compose up --build

dev-fast: ## Hot reload rápido: Postgres en Docker, API y web locales
	@[ -f .env ] || cp .env.example .env
	@echo ">> Levantando PostgreSQL..."
	@cd infra && docker compose up -d postgres
	@echo ""
	@echo ">> Iniciá en terminales separadas:"
	@echo "   Terminal 1: make dev-api"
	@echo "   Terminal 2: make dev-web"
	@echo ""
	@echo "   Preview: http://localhost:5173"
	@echo "   API docs: http://localhost:8000/api/docs"

dev-api: ## API con hot reload (uvicorn --reload)
	cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web: ## Frontend con hot reload (Vite HMR)
	cd frontend && npm run dev

dev-stop: ## Detener contenedores Docker
	cd infra && docker compose down

test: test-backend test-frontend ## Ejecutar todos los tests

test-backend: ## Tests del backend
	cd backend && python -m pytest -v

test-frontend: ## Tests del frontend
	cd frontend && npm test

lint: ## Lint backend y frontend
	cd backend && python -m ruff check .
	cd frontend && npm run lint 2>/dev/null || true

migrate: ## Ejecutar migraciones de base de datos
	cd backend && python -m alembic upgrade head

seed: ## Cargar datos de prueba
	cd backend && python ../scripts/seed-admin.py
