.PHONY: setup dev test test-backend test-frontend lint migrate seed help

help: ## Mostrar ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Instalar dependencias de todos los módulos
	@echo ">> Setup pendiente — se habilitará en Fase 0.2"

dev: ## Levantar entorno de desarrollo
	@echo ">> Docker Compose pendiente — se habilitará en Fase 0.3"
	@cd infra && docker compose up -d 2>/dev/null || echo "Infraestructura no configurada aún"

test: ## Ejecutar todos los tests
	@echo ">> Tests pendientes — se habilitarán con la implementación"

test-backend: ## Tests del backend
	@echo ">> Backend tests pendientes"

test-frontend: ## Tests del frontend
	@echo ">> Frontend tests pendientes"

lint: ## Lint en todos los módulos
	@echo ">> Lint pendiente — se habilitará con la implementación"

migrate: ## Ejecutar migraciones de base de datos
	@echo ">> Migraciones pendientes — se habilitarán en Fase 0.4"

seed: ## Cargar datos de prueba
	@echo ">> Seed pendiente — se habilitará en Fase 1"
