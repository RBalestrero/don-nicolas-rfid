# ADR-002: Aplicación móvil nativa Android

## Estado
Aceptado

## Contexto
El hardware principal de campo es el terminal Zebra MC33R, que ejecuta Android y provee un SDK RFID nativo. Se evaluó React Native, Flutter y Kotlin nativo.

## Decisión
Desarrollar la app móvil en **Kotlin nativo** con Android SDK y Zebra RFID SDK.

## Consecuencias

### Positivas
- Acceso directo al SDK RFID de Zebra sin bridges ni módulos nativos adicionales
- Mejor rendimiento en lectura masiva de tags (>900 tags/seg)
- Soporte completo de DataWedge y características del dispositivo
- Room DB para offline-first con patrones Android estándar

### Negativas
- Solo Android (no iOS), aceptable dado que el hardware es exclusivamente Android
- Mayor tiempo de desarrollo inicial vs cross-platform

### Mitigación
- El alcance del proyecto no requiere iOS
- La inversión en nativo se recupera en estabilidad y rendimiento RFID
