# Principios UX WMS aplicados en la web Don Nicolás

Resumen de patrones observados en WMS / logistics UX (Manhattan/SAP-style ops UIs, guías de dashboards logísticos y tablas densas) y cómo se traducen acá.

## Flujos y pantallas
- **Excepciones primero:** el dashboard prioriza cola operativa y KPIs accionables (abiertos, discrepancias, sin ubicación), no analytics ornamentales.
- **Un trabajo por pantalla:** inventarios en web = auditoría; ejecución en MC33.
- **Jerarquía de acciones:** botón primario = la acción del flujo; secundarios = exportar/actualizar; peligro = baja/cancelar.
- **Contexto de ubicación visible:** depósitos y asignaciones muestran depósito/sector/código sin hacer clic extra.
- **Rol distinto, superficie distinta:** la UI oculta writes que el RBAC rechazaría (403).

## Tablas operativas
- Cabecera sticky, densidad compacta, mono en EPC/patrimonial.
- Toolbar de filtros encima de la grilla (no enterrada).
- Empty states con pasos de onboarding / siguiente acción.
- En móvil: columnas prioritarias; el resto se oculta (`col-hide-sm`).

## Confirmaciones
- Diálogo inline en lugar de `window.confirm` para bajas/cancelaciones (menos fricción, más control).

## Referencias de estudio
- Logistics / WMS UX: excepciones, role-based entry, timelines de estado.
- Tablas densas: sticky header, filtros alineados al trabajo, densidad controlada.
- Warehouse floor UX: jerarquía clara de botones, feedback de estado, caminos de excepción visibles.
