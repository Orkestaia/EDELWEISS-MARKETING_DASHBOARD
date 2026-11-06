# Revisión de integración y producción — 2026-11-06

El propietario ha autorizado integrar y desplegar el módulo de stock en el chat del proyecto. Base: main ec77c83, que ya incorpora marketing y Swiss Passport. Se integra codex/stock-phase-one mediante merge explícito, conservando el historial existente.

## Comportamiento incluido

- Espacio privado de stock móvil: producción real, avances, cierres, destinos de sobrantes y planes semanales imprimibles.
- Feed web HMAC, catálogo, capturas diarias, refresco de siete días y sincronización nocturna. Sin credenciales ni escritura de Clover.
- Sugerencias explicadas de producción con encargos agregados, parámetros/eventos versionados y edición humana.
- Comparaciones/KPIs con cobertura explícita y registro de facturas alimentarias verificadas con comparación de precios compatibles.
- Sesiones revocables al cambiar contraseña, límite compartido de login, validación TLS, cuerpos limitados, control de origen, DTO permitidos y conflictos entre ediciones.

## Verificación antes de publicar

El árbol de implementación pasó 82 tests de stock/compras/login y 10 de Passport, build Next 16.2.1, TypeScript, lint, dos suites HTTP y navegador aislado. Cuatro paneles se comprobaron con la BD real a 320/390 px, sin mutaciones de navegador ni errores. Estos controles se repiten según corresponda sobre main integrado antes del despliegue.

La configuración de producción se ha comprobado por nombre y presencia, sin imprimir valores: DATABASE_URL, DASHBOARD_PASSWORD, DASHBOARD_SESSION_SECRET, DASHBOARD_FEED_SECRET y CRON_SECRET. La subida excluye archivos de entorno, cachés y capturas privadas mediante .vercelignore. Se desactiva el despliegue automático por push a main, de modo que publicar requiere npm run deploy:production y sus comprobaciones de rama/estado/remoto.

## Límites que debe conocer el equipo

- Siete productos aún requieren confirmar su relación con el catálogo; no se sustituyen por coincidencias aproximadas.
- Las sugerencias requieren validar bandejas/parámetros y una semana de revisión con Valentina. Los recuentos y planes manuales pueden utilizarse desde el inicio.
- Las tres facturas importadas son una muestra verificada de dos proveedores; no constituyen un histórico completo. La lectura periódica de Gmail, abonos/descuentos negativos y recomendaciones de pedidos de ingredientes siguen pendientes.
- La fase 3 restante (histórico anual, estacionalidad y reglas de bandejas), las masas/congelador y la escritura en Clover no están activadas.
- El acceso sigue usando contraseña compartida; los nombres del personal son autodeclarados. No hay funcionamiento offline completo.

Después de publicar se comprueba la URL canónica, redirección de páginas privadas, rechazo de APIs sin sesión, sesión real con cookie segura, vistas autenticadas sin filtrar datos privados a stdout y estado del despliegue. No se crean planes ni cierres ficticios en producción para verificarlo.
