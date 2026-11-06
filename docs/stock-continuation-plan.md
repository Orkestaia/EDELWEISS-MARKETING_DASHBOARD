# Continuación de stock y compras — 2026-11-05

Goal: completar captura real de fase 1, recomendaciones explicadas de fase 2 y registro privado de compras alimentarias, conforme al alcance aprobado por Aitor.

Architecture: cliente HMAC servidor → feed web; Postgres existente → servicios separados de captura, planificación y compras; APIs privadas → UI móvil. Gmail se consulta mediante el conector Edelweiss. Solo se extraen campos de negocio de proveedores alimentarios verificados. Factura no equivale a recepción ni stock disponible.

La autorización existente permite continuar el diseño explicado y el contrato aprobado. La escritura en Clover sigue requiriendo aprobación adicional de Valentina; no se activa. Producción requiere main limpio e integrado y el script del repositorio.

## Ejecución

- [x] Validar catálogo y ventas reales con WebsiteFeed sin imprimir secretos.
- [x] Verificar DATABASE_URL del proyecto y configurar solo esa variable en el archivo local privado.
- [x] Migración aditiva y captura real reanudable, verificando correspondencias exactas y días completos.
- [x] Corregir con TDD: DTOs permitidos, revocación de sesiones, límite de login compartido y serialización de asociaciones/capturas.
- [x] Motor fase 2 con tests de corrección por agotados, base semanal, buffers, eventos/cierres, redondeo y encargos separados.
- [x] Persistir recomendaciones/explicaciones; parámetros y eventos versionados. API de encargos solo con cantidades y producto, sin PII; fallo de fuente impide aceptar recomendaciones incompletas.
- [x] UI Next bake y Settings: móvil, edición explícita y conservación de planes manuales.
- [x] Registro privado de proveedores/facturas, idempotencia y comparación por SKU/unidad/moneda compatibles. Sin cuerpos de correo, HTML, datos bancarios, adjuntos originales o secretos en Git/respuestas.
- [x] Importar muestras de facturas verificadas mediante el conector. Los casos dudosos quedan fuera, correos no se marcan/mueven/envían y enlaces no se ejecutan.
- [x] Verificación Postgres/PGlite, HTTP, navegador, build, lint de fuentes y revisión independiente. Documentar pruebas y límites reales.

## Resultado verificado — 2026-11-06

92 tests correctos (82 stock/compras/login y 10 Passport), build Next 16.2.1 y lint global. Pasan las dos suites HTTP y el navegador aislado para recuento, reintentos, conflictos, plan y PDF. La revisión de solo lectura con BD real pasa Next bake, Settings, Purchases y Review a 390 y 320 px: cero desbordamientos, errores de página/consola, peticiones externas o mutaciones de navegador. Contraste de encabezados comprobado y capturas privadas en output/stock-continuation, fuera de Git.

La sincronización real refrescó siete días completos, incluyendo 2026-11-05, sin días pendientes. Catálogo: 135 artículos; planificación: 26 productos y 19 relaciones confirmadas. Compras: tres facturas verificadas de dos proveedores. TLS con certificado verificado y revisión independiente de controles de acceso/DTO/concurrencia. No se ha realizado despliegue ni integración a main.

Los siete días de captura real, el cierre medido por el personal y la validación del plan por Valentina son aceptación del negocio. Para optimizar pedidos de ingredientes harán falta recetas, inventario, caducidad y plazos reales; no se inventarán.
