# Revisión de integración y producción — 2026-11-06

## Guías de usuario actualizadas — 2026-11-13

Edición EN/ES del 13 de noviembre: mantiene seis páginas y el caso ficticio Plain Croissant. Se aclaran la fecha de recogida y el conteo único de encargos, recomendaciones bloqueadas y uso manual revisado, separación de campañas Thanksgiving y la diferencia entre ventas por pago y métricas comparables por recogida. No cambian controles, autenticación ni datos de trabajo. El contenido evita vocabulario del contrato técnico.

Doce páginas renderizadas y revisadas, fuentes embebidas y copias finales idénticas a los recursos privados. El generador comprueba fecha, temas nuevos y margen al pie; margen mínimo 113,5 pt. Recorrido de ayuda EN/ES en ordenador/móvil y descarga autenticada de ambos PDF con hash coincidente correctos. Inglés SHA256 `906fab0a9f617730924cdf280a9df3636f83f4ebeedd3cee6c870531ba8e1d88`; español `25020f30f4cdf76ff710b5baf26a1d7d151c49d5f22330fe8ff725b4c753438f`.

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

Este registro describe la publicación inicial 29f0c3b; los apartados siguientes recogen las actualizaciones.

## Corrección del formulario de acceso — 2026-11-06

El primer inicio de sesión del propietario reveló un 403 Forbidden. Se reprodujo con el formulario HTML real en Chromium: la política global no-referrer provocaba Origin: null en la navegación POST y sameOrigin rechazaba la petición. Las pruebas anteriores del login enviaban Origin explícitamente y no detectaban ese caso.

La corrección cambia únicamente la política global a same-origin; no acepta Origin null ni orígenes externos y conserva la validación CSRF, la contraseña y las cookies seguras. `npm run test:login:browser` comprueba el formulario nativo, el Origin generado por Chromium sin inyección, la sesión y el acceso a stock; también comprueba el rechazo de orígenes externos/nulos. Se ejecuta después del build, con Chromium instalado o PLAYWRIGHT_CHROMIUM_EXECUTABLE configurado.

Corrección publicada mediante el script autorizado desde main `6ed96f96f3836af03b18d88add0ca33934ba5e54`, despliegue `dpl_Gynkhx3PzCnvjGn4aQaCEgNLLQ4V`, estado READY. Build, lint, 92 tests, dos suites HTTP y prueba del formulario nativo correctos. En la URL real se comprobó que el formulario con una credencial sintética no válida produce el comportamiento normal (303 a login con mensaje de contraseña incorrecta) en lugar de Forbidden; no se emplearon credenciales reales ni se creó una sesión de prueba en producción. Se comprobó también 403 para Origin null/externo y cero errores en los logs consultados. La página /login debe cargarse de nuevo para descartar la política anterior.

El propietario confirmó posteriormente que ya puede iniciar sesión y que el módulo funciona.

## Visita guiada y guías de usuario

Se añade una visita de 12 pasos EN/ES, automática la primera vez por navegador y repetible desde Help & guides. Solo cambia el estado de ayuda y desplaza el foco visual: no cambia vista, fecha ni cantidades y no envía escrituras. Durante la visita se bloquea la interacción con controles subyacentes; teclado, Escape y cierre restauran la interacción. Idioma y finalización se recuerdan localmente sin datos personales.

Las guías EN/ES tienen seis páginas Letter, fuentes embebidas y ejemplos ficticios; se han revisado las doce páginas renderizadas. Se versionan únicamente los PDF finales y su generador; las descargas pasan por una ruta autenticada con idiomas permitidos en/es, rutas fijas y no-store. Los originales no se ponen en public y los renders de revisión quedan excluidos de Git y Vercel.

Publicación de onboarding y PDF: main `1e897a1ea8c4b7694970a34d955e9b5ec6d06a05`, despliegue `dpl_GeN9mpWTQxn6k8ttSkDmNYfw19Zu`, READY en producción mediante npm run deploy:production. Build, lint, 92 tests y cinco recorridos HTTP/navegador correctos, incluida la visita completa en inglés/español a 320/390 px, teclado, ausencia de escrituras y descarga autenticada local de ambos PDF. Se confirmó en Vercel que las dos guías están empaquetadas, las descargas sin sesión devuelven 401, no hay artefactos privados inesperados y los logs consultados no contienen errores.

## Práctica interactiva — sustituye la visita de lectura

La revisión del propietario pide aprender pulsando los controles y mantener visible la sección. Se sustituye la visita anterior por un espacio de práctica independiente con 18 acciones EN/ES sobre Plain Croissant: explicar 18 sugeridos + 2 encargos, cambiar el plan de 20 a 26 con motivo Local event, registrar 26 producidos y 4 sobrantes repartidos en 2 TGTG + 1 reutilizado + 1 desechado, y cambiar exclusivamente el viernes de la semana siguiente de 16 a 18. Review muestra 22 ventas explícitamente simuladas. La app real recibe ventas de Clover; no las deduce restando sobrantes.

La referencia original usada es el CSV extraído del Excel de Valentina: 26 productos y cantidades semanales, con Plain Croissant en 12 de lunes a jueves y 16 de viernes a domingo. Esto no reproduce íntegramente el libro original ni activa las funciones pendientes enumeradas arriba. Las demás cantidades, encargos, bandejas y eventos de la lección son ficticios.

La práctica solo usa estado React en memoria, sin llamadas a APIs ni persistencia de negocio. La app subyacente queda inerte; salir restaura foco y desplazamiento, manteniendo fecha y borradores. Solo idioma y finalización de ayuda se guardan localmente. La nueva versión se ofrece también a quienes completaron la visita anterior y se repite desde Help & guides. Solo el campo del paso activo permite edición; volver atrás reinicia el objetivo y los estados de revisión correspondientes. Las explicaciones quedan a la derecha en ordenador y encima, sin tapar la sección, en móvil; el control objetivo se amplía y resalta.

Se actualizan los dos PDF de seis páginas con la misma historia, controles y distinción entre práctica y uso real. Las rutas privadas y sus restricciones permanecen. Verificación: build, lint, 92 tests; recorridos completos de práctica EN/ES en 1440/320 px, idioma conservando el ejercicio, Back, cierre revisado sin edición fuera de fase, cero peticiones de negocio durante la práctica, cero escrituras, teclado, reapertura y descargas autenticadas con hashes coincidentes. Regresiones de login nativo, stock real en base aislada y límites HTTP completan la comprobación antes de publicar. Revisión independiente: sin nuevos P1/P2.

Publicada desde main limpio `ec1562111c306cb251a5a8ed358f43954fb69033`, con `a60a059` integrado, mediante `npm run deploy:production`. Vercel `dpl_8P12AJjkgLwmTseaArm7pr1muJZ3`, READY, producción y alias canónico coincidentes. Login 200, stock privado 307 al acceso y API/ambas guías 401 sin sesión; cero errores en los logs consultados. Inventario remoto: 270 entradas, dos PDF esperados y ningún archivo privado inesperado; output/tmp solo aparecen como directorios vacíos, sin renders ni diagnósticos. El test HTTP de Passport usa ahora el puerto aislado 3215 y comprueba disponibilidad del servidor; el puerto 3200 producía 404 en el entorno local. Misma suite completa correcta en 3215, sin cambios al código de Passport.

Guías del 13 de noviembre publicadas mediante npm run deploy:production desde main limpio e integrado d5820ce76dbd801faea769a4998100b59ae9cc08, despliegue dpl_DoY3PN3Dd6L7Keiz6yt3AFPjjvmF, READY en el alias canónico. Se verifican las dos guías empaquetadas y 401 sin sesión para ambas descargas; ningún artefacto privado inesperado en el inventario remoto. Las copias de output/pdf y recursos privados son idénticas. El primer push falló por HTTP 408; el reintento y el despliegue terminaron correctamente.
