# ADR-001: Arquitectura monolito modular

## Estado
Aceptado

## Contexto
El sistema RFID Don Nicolás requiere gestionar activos, depósitos, inventarios y transferencias. Se evaluó si implementar microservicios o un monolito.

## Decisión
Adoptar un **monolito modular** con FastAPI, separando lógica por dominios (`assets`, `warehouses`, `inventory`, `transfers`) dentro de un mismo despliegue.

## Consecuencias

### Positivas
- Menor complejidad operativa (un solo despliegue, una base de datos)
- Desarrollo más rápido para el equipo y el alcance del MVP
- Transacciones ACID simples entre módulos
- Facilita testing de integración

### Negativas
- Escalado horizontal limitado a nivel de aplicación completa
- Un fallo en un módulo puede afectar toda la API

### Mitigación
- Módulos desacoplados internamente permiten extraer un microservicio en el futuro si un dominio lo requiere
- Docker permite escalar réplicas del monolito si es necesario
