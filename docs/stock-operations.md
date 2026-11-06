# Stock y producción: uso y estado

Actualización: 2026-11-06. Contrato: [STOCK-PLANNING-SPEC.md](STOCK-PLANNING-SPEC.md). La interfaz del equipo está en inglés, como establece el contrato.

## Para explicarlo al equipo

La herramienta reúne lo que se vende, lo que se prepara, lo que sobra y lo que se compra. Ayuda a preparar el día siguiente con datos y deja que el equipo ajuste las cantidades con su criterio. Las sugerencias requieren revisión; no hacen pedidos ni cambian Clover.

1. **Antes de producir — Next bake.** Elegir la fecha y escribir el nombre. Revisar la sugerencia por producto y los encargos separados. Abrir “Why this quantity?” para entenderla, ajustar si hace falta y guardar cada producto. Los cambios superiores al 20 % requieren un motivo. Los planes ya guardados se conservan al recalcular.
2. **Durante el día — Today & close.** Registrar la producción real desde el móvil. El plan no se convierte en producción hasta confirmarlo. Un campo vacío significa “sin contar”; cero significa “contado y no hay”. Los avances válidos se guardan automáticamente y los fallos quedan visibles.
3. **Al cerrar.** Contar sobrantes y separar TGTG, reutilización y descarte. Confirmar agotado y hora si procede. Si se preparó lo previsto y se vendió todo, hay un botón explícito para confirmarlo. Terminar cada producto después de revisar.
4. **Para organizarse — Week plan.** Revisar y editar la semana, con totales por día y familia; imprimir una página Letter para cocina. Cambiar un día no modifica las cantidades recurrentes.
5. **Para mejorar — Review.** Comparar ventas y días con datos. Consultar sobrantes y precisión cuando existan cierres medidos. Las métricas sin datos suficientes aparecen pendientes, no como cero.
6. **Para compras — Purchases.** Consultar las facturas importadas y cambios de precio. Una factura registra una compra; no confirma recepción, existencias ni pago.

No se necesita introducir JSON ni gestionar proveedores para el recuento diario. Los formularios técnicos de importación quedan en administración avanzada. No hay funcionamiento offline completo: un guardado solo está confirmado cuando responde el servidor. Los borradores del recuento pueden recuperarse en la misma pestaña.

## Datos reales comprobados

- Feed autenticado con la firma del contrato: catálogo de 135 artículos y una respuesta completa de ventas del día anterior. Nunca se han añadido credenciales de Clover.
- Al menos 90 días completos de ventas almacenados; última captura validada: 2026-11-05. Se releen los siete más recientes para recoger devoluciones posteriores. Los errores y las fechas sin captura no se convierten en ventas cero.
- 26 productos de planificación; 19 vinculados por coincidencias exactas o los alias explícitos del CSV. Las siete correspondencias restantes requieren confirmación, incluidas las dos denominaciones provisionales de Kuchen.
- Tres facturas verificadas de dos proveedores alimentarios normalizadas en Postgres privado. No equivalen a todo el histórico de compras. Los abonos y descuentos negativos aún requieren revisión y no se contabilizan como compras positivas.

Las capturas históricas cumplen la parte de almacenamiento de la fase 1. Todavía hay que medir un cierre real con el equipo en menos de dos minutos. La fase 2 necesita además que Valentina contraste una semana de recomendaciones con su criterio.

## Qué calcula y qué falta

El motor usa los últimos cuatro mismos días de semana válidos; con menos de tres usa la cantidad manual. Excluye eventos y cierres, aplica factores y margen por variabilidad, redondea a bandejas y añade los encargos confirmados por separado. La corrección de demanda por agotado requiere evidencia de cierre y una curva horaria fiable; el stock actual de Clover no prueba un agotado histórico. Los ajustes negativos por devoluciones se conservan en el registro de ventas y se excluyen de la estimación de demanda con aviso.

La fuente de encargos se lee solo en servidor y entrega al módulo cantidades por producto, sin datos de clientes. Si no está disponible, contiene fechas/estados ambiguos o productos sin correspondencia, se muestra el problema y no se permite aceptar una recomendación incompleta. El plan manual sigue disponible para que el equipo lo resuelva conscientemente.

Review incorpora comparaciones semana/mes/año, media por día abierto, cobertura, alineación de festivos móviles y KPIs con datos conocidos. Las comparaciones agregadas se limitan a los productos vinculados y lo indican. Las métricas de cierre y precisión necesitan cierres reales: aún no hay validación contra cinco muestras de informes Clover.

Quedan de la fase 3 la importación de históricos anuales, el factor estacional y las reglas automáticas de subir/bajar una bandeja. La fase 4 —masas D+3, congelador y escritura opcional en Clover— no se ha activado. El factor estacional actual es 1 y se explica en pantalla.

Antes de usar recomendaciones como estándar hay que confirmar asociaciones, piezas por bandeja, horarios objetivo y parámetros. Para calcular pedidos de ingredientes hacen falta recetas/rendimientos, inventario, caducidades, formatos, mínimos de pedido y plazos de proveedores. No se deducen de una factura aislada.

## Gmail y compras

Se utiliza exclusivamente la conexión de Gmail de Edelweiss y se limita la selección a proveedores de comida, ingredientes o bebidas. Se comprueba remitente/asunto antes de leer contenido y se verifican las facturas relevantes. No se envían, marcan, mueven ni eliminan correos.

Se guardan proveedor, documento, fecha, moneda, productos, cantidades, unidad/formato e importes. Remitentes e identificadores de origen sirven para validación/idempotencia y no se devuelven en vistas de compras. No se guardan cuerpos de correo, HTML, datos bancarios, enlaces firmados ni adjuntos originales en el repositorio. Los recargos se separan de los productos. Los precios solo se comparan entre el mismo proveedor, SKU, unidad y moneda; no se inventan conversiones de formatos.

La lectura de este chat no instala acceso Gmail en el servidor. El registro y las importaciones verificadas funcionan; la ingesta periódica desatendida aún necesita un proceso privado con permisos de lectura limitados y control de remitentes. No hay automatización de pedidos ni lectura automática de toda la bandeja.

## Acceso y operación técnica

Variables privadas de servidor: `DATABASE_URL`, `DASHBOARD_FEED_SECRET`, `DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET` y `CRON_SECRET`. Ninguna utiliza `NEXT_PUBLIC_`. Los errores de infraestructura se devuelven sin detalles sensibles. Las APIs exigen sesión; las mutaciones verifican Origin y limitan el tamaño del cuerpo. Las vistas son privadas y no se almacenan en caché. Las respuestas se reconstruyen con campos permitidos.

El login tiene un límite global compartido en Postgres: 30 intentos fallidos o pendientes en 15 minutos, con reserva atómica. No confía en cabeceras IP suministradas por clientes. Ese límite puede impedir temporalmente el acceso legítimo durante una ráfaga. Las contraseñas/sesiones no se registran. La contraseña compartida no ofrece roles ni identidad individual: el nombre del empleado es autodeclarado. Las conexiones Postgres verifican el certificado TLS; se ha comprobado la conexión real con esa verificación activa.

Las migraciones son aditivas y acotadas a las tablas nuevas. Las modificaciones usan versiones para rechazar ediciones antiguas; asociaciones y capturas se serializan para no materializar ventas con relaciones incoherentes. Los parámetros/eventos y el recuento dejan trazabilidad con actor y hora. Se ha corregido la serialización JSONB del driver real y añadido reparación idempotente para los datos propios afectados.

La sincronización nocturna está definida en `vercel.json`, con protección Bearer, guardia horaria Maine y lease contra ejecuciones solapadas. Las capturas iniciales se ejecutaron de forma controlada; el cron entra en servicio al desplegar la versión integrada autorizada por el propietario. La revisión para producción está en [stock-production-review.md](stock-production-review.md).

```bash
npm test
npm run lint
npm run build
npm run test:stock:http
npm run test:stock:browser
```

Los tests unitarios/PGlite y navegador aislado no escriben compras ni planes reales. `test:stock:live` es una comprobación opt-in de lectura contra la base configurada y requiere `STOCK_LIVE_READONLY=1`; usa un login local de pruebas y bloquea mutaciones de stock en el navegador. Las capturas privadas quedan en `output/`, ignorado por Git. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite elegir Chromium instalado.

La captura manual real se ejecuta con `npm run sync:stock -- --confirm-database` después de comprobar el entorno privado de destino; es una escritura explícita de capturas, no un test.

Producción solo desde `main` limpio e integrado, coincidente con `origin/main`, mediante `npm run deploy:production`. No desplegar la rama de trabajo ni promover artefactos saltándose ese script.

Los despliegues automáticos por push a `main` se desactivan en `vercel.json` para que no se salten este procedimiento. `.vercelignore` excluye credenciales y artefactos privados de la subida de Vercel, además de las exclusiones de Git.

## Verificación de esta entrega — 2026-11-06

- 82 tests de stock, planificación, compras y login, y 10 de Passport: todos correctos.
- Build Next.js 16.2.1, TypeScript y ESLint global: correctos.
- HTTP real: sesión, CSRF, límites de cuerpo, cabeceras privadas y seguridad, APIs de stock/planificación/compras, Passport y separación del cron.
- Navegador aislado: recuento móvil, guardado/recarga, reintento, conflicto, cierre rápido, motivos del plan, cantidades recurrentes y PDF de una página Letter.
- Navegador con datos reales: cuatro paneles, 390/320 px, contraste de encabezados y cero desbordamientos, errores, peticiones externas o mutaciones de navegador. Se ha comprobado la vista real; no se han creado planes/cierres ficticios para que parezca validación del personal.
- La sincronización real más reciente guardó/refrescó siete días completos sin pendientes. La conexión a Postgres pasó con validación del certificado TLS activa. La revisión independiente no encontró nuevos problemas P1/P2 en los controles revisados.

Estas pruebas técnicas no sustituyen el cierre cronometrado del equipo, la revisión de cantidades por Valentina ni la conciliación pendiente contra informes Clover.
