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

## Publicación realizada — 2026-11-06

- Código de aplicación: main `29f0c3b5d517241491dbb1b586350075cfc9ece7`, con feature `c118146` integrada. Las ramas de marketing y Passport ya estaban incluidas.
- Se repitieron sobre main integrado `npm test` (82 + 10 tests), `npm run build`, `npm run lint` y ambas suites HTTP: correctos.
- Se publicó exclusivamente con `npm run deploy:production`, desde main limpio y coincidente con origin/main.
- Vercel: `dpl_GreFgSp71YxLUgbyBvzmDCG4xr1Z`, estado READY, target production, rama main y commit coincidentes.
- URL: https://edelweiss-marketing-dashboard.vercel.app/stock. La página redirige al login y las siete APIs privadas comprobadas rechazan acceso sin sesión con 401. Las tres definiciones de cron están presentes.
- Inventario remoto: 252 entradas examinadas, cero archivos privados inesperados. Consulta de logs del despliegue: cero entradas de error en el momento de la comprobación.

La contraseña de producción es de tipo sensitive: Vercel no devuelve su valor y no está en los archivos locales. La comprobación autenticada dentro de producción está pendiente del inicio de sesión del propietario en la pestaña abierta; no se ha desactivado autenticación ni cambiado la contraseña. La verificación de cuatro paneles con BD real y las pruebas de guardado/conflictos se realizaron previamente en el servidor local de producción descrito en stock-operations.md. No confundir esa evidencia con una prueba autenticada completada en Vercel.

Este registro posterior a la publicación solo modifica documentación; el commit de aplicación desplegado sigue siendo 29f0c3b.

## Corrección del formulario de acceso — 2026-11-06

El primer inicio de sesión del propietario reveló un 403 Forbidden. Se reprodujo con el formulario HTML real en Chromium: la política global no-referrer provocaba Origin: null en la navegación POST y sameOrigin rechazaba la petición. Las pruebas anteriores del login enviaban Origin explícitamente y no detectaban ese caso.

La corrección cambia únicamente la política global a same-origin; no acepta Origin null ni orígenes externos y conserva la validación CSRF, la contraseña y las cookies seguras. `npm run test:login:browser` comprueba el formulario nativo, el Origin generado por Chromium sin inyección, la sesión y el acceso a stock; también comprueba el rechazo de orígenes externos/nulos. Se ejecuta después del build, con Chromium instalado o PLAYWRIGHT_CHROMIUM_EXECUTABLE configurado.

El propietario confirmó posteriormente que ya puede iniciar sesión y que el módulo funciona.

## Visita guiada y guías de usuario

Se añade una visita de 12 pasos EN/ES, automática la primera vez por navegador y repetible desde Help & guides. Solo cambia el estado de ayuda y desplaza el foco visual: no cambia vista, fecha ni cantidades y no envía escrituras. Durante la visita se bloquea la interacción con controles subyacentes; teclado, Escape y cierre restauran la interacción. Idioma y finalización se recuerdan localmente sin datos personales.

Las guías EN/ES tienen seis páginas Letter, fuentes embebidas y ejemplos ficticios; se han revisado las doce páginas renderizadas. Se versionan únicamente los PDF finales y su generador; las descargas pasan por una ruta autenticada con idiomas permitidos en/es, rutas fijas y no-store. Los originales no se ponen en public y los renders de revisión quedan excluidos de Git y Vercel.

Corrección publicada mediante el script autorizado desde main `6ed96f96f3836af03b18d88add0ca33934ba5e54`, despliegue `dpl_Gynkhx3PzCnvjGn4aQaCEgNLLQ4V`, estado READY. Build, lint, 92 tests, dos suites HTTP y prueba del formulario nativo correctos. En la URL real se comprobó que el formulario con una credencial sintética no válida produce el comportamiento normal (303 a login con mensaje de contraseña incorrecta) en lugar de Forbidden; no se emplearon credenciales reales ni se creó una sesión de prueba en producción. Se comprobó también 403 para Origin null/externo y cero errores en los logs consultados. El propietario debe cargar de nuevo /login para descartar la política de la página anterior; el acceso con su contraseña sigue pendiente de su confirmación.
