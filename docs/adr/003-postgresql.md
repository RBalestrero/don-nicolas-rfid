# ADR-003: PostgreSQL como base de datos

## Estado
Aceptado

## Contexto
El dominio del sistema es altamente relacional: activos pertenecen a categorías, se ubican en depósitos/sectores/ubicaciones, y generan historial de movimientos con integridad referencial.

## Decisión
Usar **PostgreSQL 16** como base de datos principal.

## Consecuencias

### Positivas
- Modelo relacional natural para el dominio
- ACID completo para transferencias y movimientos
- JSONB disponible si se necesita flexibilidad en datos técnicos de activos
- Gratuito, maduro, amplio soporte en hosting

### Negativas
- Requiere migraciones con Alembic para cambios de esquema
- Escalado vertical primero (suficiente para el alcance actual)

### Mitigación
- Índices optimizados para consultas de stock e inventario
- Evaluar read replicas solo si el volumen lo justifica en fase 2
