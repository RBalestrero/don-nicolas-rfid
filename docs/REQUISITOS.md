# Requisitos del Sistema — Don Nicolás RFID

> Documento derivado de: `Propuesta de proyecto V002 TECNICA (1).docx`  
> Versión: 1.0 | Fecha: 2026-08-28

## 1. Objetivo general

Implementar una solución integral de identificación y trazabilidad mediante tecnología **RFID UHF** que permita gestionar el ciclo completo de los activos del cliente, desde su identificación inicial hasta su localización, inventario y control de stock en múltiples depósitos y ubicaciones remotas.

## 2. Alcance funcional

### 2.1 Módulo 1 — Alta e Identificación de Activos

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| M1-R01 | Alta de activos con datos básicos y técnicos | Alta |
| M1-R02 | Asignación de categorías a activos | Alta |
| M1-R03 | Carga de fotografías por activo | Media |
| M1-R04 | Asociación de identificación RFID única (EPC/TID) | Alta |
| M1-R05 | Impresión de etiquetas RFID con QR, código de barras, descripción y número patrimonial | Alta |
| M1-R06 | Historial completo del activo (auditoría) | Alta |
| M1-R07 | Gestión de usuarios, roles y permisos | Alta |

**Hardware asociado:**
- Impresora RFID Zebra ZD621R (etiquetas generales)
- Impresora RFID Zebra ZT411 (etiquetas on-metal)

### 2.2 Módulo 2 — Gestión de Depósitos e Inventario Móvil

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| M2-R01 | Creación y administración de depósitos | Alta |
| M2-R02 | Creación de sectores y ubicaciones dentro de depósitos | Alta |
| M2-R03 | Asignación inicial de activos a ubicaciones | Alta |
| M2-R04 | Consulta de stock por depósito/sector/ubicación | Alta |
| M2-R05 | Historial de movimientos y trazabilidad de transferencias | Alta |
| M2-R06 | Inventario masivo con terminal RFID (lectura simultánea) | Alta |
| M2-R07 | Detección de faltantes y sobrantes en inventario | Alta |
| M2-R08 | Búsqueda de activos específicos por RFID | Alta |
| M2-R09 | Operación en línea y fuera de línea (sincronización) | Alta |
| M2-R10 | Transferencias entre depósitos con confirmación RFID | Alta |

**Hardware asociado:**
- Terminal móvil Zebra MC33R (Android, RFID UHF RAIN, EPC Gen2)

### 2.3 Requisitos no funcionales

| ID | Requisito | Criterio de aceptación |
|----|-----------|------------------------|
| NFR-01 | Rendimiento de inventario | Lectura masiva > 900 tags/seg (capacidad del hardware) |
| NFR-02 | Disponibilidad | API disponible ≥ 99% en horario operativo |
| NFR-03 | Seguridad | Autenticación JWT, roles RBAC, HTTPS obligatorio |
| NFR-04 | Trazabilidad | Todo movimiento de activo queda registrado con usuario, fecha y origen/destino |
| NFR-05 | Escalabilidad | Soporte multi-depósito sin límite práctico en cantidad de ubicaciones |
| NFR-06 | Offline-first (móvil) | Inventarios y transferencias operables sin conectividad, con sync posterior |
| NFR-07 | Auditoría | Logs de acciones críticas conservados mínimo 2 años |

## 3. Actores del sistema

| Actor | Descripción |
|-------|-------------|
| Administrador | Gestión de usuarios, depósitos, configuración global |
| Operador de depósito | Inventarios, transferencias, consultas de stock |
| Operador de alta | Registro de activos e impresión de etiquetas |
| Supervisor/Gerencia | Dashboards, reportes e indicadores |

## 4. Integraciones de hardware

| Dispositivo | Protocolo/SDK | Uso |
|-------------|---------------|-----|
| Zebra MC33R | Zebra RFID SDK (Android) + DataWedge | Inventario, búsqueda, transferencias |
| Zebra ZD621R | ZPL + comandos RFID (Zebra Link-OS) | Impresión y codificación de etiquetas |
| Zebra ZT411 | ZPL + comandos RFID on-metal | Impresión sobre metal |
| Etiquetas UHF | EPC Gen2 V2 / ISO 18000-63 | Identificación única de activos |

## 5. Entidades principales del dominio

```
Usuario ──┬── Rol ── Permiso
          │
Activo ───┼── Categoría
          ├── EtiquetaRFID (EPC, TID)
          ├── Fotografía
          ├── DatosTécnicos
          └── HistorialMovimiento
                    │
Depósito ─── Sector ─── Ubicación
                    │
Inventario ─── DetalleInventario (esperado vs leído)
                    │
Transferencia ─── DetalleTransferencia
```

## 6. Casos de uso prioritarios (MVP)

1. **UC-01** — Registrar un activo e imprimir su etiqueta RFID
2. **UC-02** — Crear depósito con sectores y ubicaciones
3. **UC-03** — Asignar activo a una ubicación
4. **UC-04** — Realizar inventario masivo con MC33R
5. **UC-05** — Transferir activos entre depósitos
6. **UC-06** — Consultar stock y historial de un activo
7. **UC-07** — Generar reporte de faltantes/sobrantes post-inventario
