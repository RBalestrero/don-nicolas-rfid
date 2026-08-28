# ADR-004: Modo offline-first en aplicación móvil

## Estado
Aceptado

## Contexto
Los depósitos y ubicaciones remotas pueden tener conectividad intermitente. El inventario masivo no debe depender de conexión permanente a la API.

## Decisión
Implementar patrón **offline-first** en la app Android con Room (SQLite local) y cola de sincronización.

## Consecuencias

### Positivas
- Inventarios y transferencias operables sin red
- Mejor experiencia del operador en campo
- Datos se sincronizan automáticamente al recuperar conexión

### Negativas
- Complejidad adicional en resolución de conflictos
- Duplicación temporal de datos (local + servidor)

### Mitigación
- Servidor como fuente de verdad
- Conflictos registrados en log de auditoría con notificación al operador
- Estrategia last-write-wins con timestamp para la mayoría de operaciones
