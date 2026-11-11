# Validación de la revisión de Claude

Orden de trabajo: §5 de STOCK-REVIEW-2026-11-06. Las comprobaciones técnicas no cierran las aceptaciones de negocio ni acreditan que el doble conteo esté resuelto. No se han creado pedidos, cierres o planes de prueba en producción ni modificado correspondencias sin confirmar.

## 1. Asociaciones — comprobadas, siete confirmaciones pendientes

Consulta real de solo lectura a Postgres y catálogo firmado: 26 productos, 19 vinculados, cero vínculos diarios a los ocho artículos Thanksgiving. Se añaden rechazos en guardado manual y asociación automática para nombres Thanksgiving o explícitamente pre-order/preorder. La materialización también los excluye si existe un vínculo antiguo o un renombrado; las capturas originales se conservan. Prueba de integración para los 26 productos, sincronización, enlace antiguo y un producto cotidiano Seasonal Quiche válido.

No se completan las siete asociaciones por semejanza de nombres. Estas son candidatas para que Valentina/Claude confirmen producto y formato:

| Producto de planificación | Candidato del catálogo; NO confirmado |
|---|---|
| Baileys Bread & Butter Pudding | Bailey's Bread Pudding; distinguir de Large Bread Pudding |
| Seasonal Financier | Seasonal Financier GF; confirmar receta/formato |
| Chocolate & Raspberry Streusel Kuchen | Struesel Kuchen; distinguir de Streusel 7 pulgadas y campañas |
| Seasonal Vanilla Kuchen | Vanilla Fruit Kuchen o Seasonal Vanilla Cake; ambiguo |
| Pain au Chocolat | Chocolate Croissant; distinguir de la variante con vanilla creme |
| Maine Grains Whole Wheat | Whole Wheat Maine Grains; confirmar formato |
| Zopf | Butter Zopf; confirmar formato |

No se considera cualquier artículo con nombre de festividad automáticamente identificado: el feed actual carece de metadatos completos de origen/preventa. Otras campañas necesitan clasificación explícita antes de vincularlas.

## 2. Timeout — corregido

Cliente de ambos GET: 30 s por intento, con firma y señal nuevas, un reintento de red/5xx, sin reintento de 401. No cambian endpoints, secreto ni reglas de firma. Prueba con reloj simulado: respuesta a los 12 s aceptada y expiración a los 30 s. La sincronización sigue siendo secuencial con presupuesto de 200 s y límite de ruta de 300 s. Esta corrección no modifica la atribución pago/recogida.

## 3. Cinco días — consistencia comprobada; conciliación independiente pendiente

Se contrastaron en lectura capturas completas, ventas materializadas por producto y feed actual. No hubo diferencias en las cinco fechas iniciales, incluido 2026-09-26 con una unidad devuelta. Se comprobó adicionalmente el día cero 2026-10-12 para reemplazar la suposición incorrecta sobre 2026-10-28. Los importes no se usan como criterio de conciliación.

| Fecha Maine | Motivo | Resultado inicial del feed |
|---|---|---|
| 2026-10-28 | Día supuestamente cero según revisión | 1 pedido pagado, 12 unidades; requiere aclaración |
| 2026-10-31 | Sábado | 65 pedidos pagados, 188 unidades |
| 2026-11-01 | Domingo y cambio horario | 60 pedidos pagados, 206 unidades |
| 2026-10-12 | Día cero identificado en capturas | Completo, 0 pedidos pagados y 0 unidades; se conserva como cero, no ausente |
| 2026-09-26 | Devolución registrada | 72 pedidos pagados, 196 unidades netas, 1 devuelta |

Los informes independientes Clover Reporting → Sales → Items no están en los archivos locales ni se encontraron en las búsquedas dirigidas del Drive conectado. El feed y la base derivados de él NO son dos fuentes independientes. No se marca este paso como aprobado contra Clover. Se necesitan informes con las mismas fechas Maine y definición de unidades netas; la cobertura completa sigue limitada por las siete asociaciones pendientes.

El 28 de octubre las 12 unidades figuran como mostrador: dos unidades de cada uno de seis productos. No se han forzado a cero por considerar el local cerrado. Claude debe verificar origen/pruebas y clasificación contra el pedido y el informe de Clover.

## 4. Pedido futuro — defecto confirmado en código; prueba real pendiente

El cálculo actual utiliza `unitsInStore + unitsOnline` por fecha de pago y añade los encargos de recogida. Esto permite el doble conteo descrito en la revisión; el payload v1.1 no permite deshacerlo de forma fiable. No se sustituye silenciosamente por solo mostrador, que perdería ventas online del mismo día. El caso real de un pedido identificado necesita la colaboración de Claude/Valentina y v1.2 para acreditar el resultado corregido. No se ha creado ningún cobro o pedido para simular esta aceptación.

Aitor ha autorizado preparar la coordinación de v1.2. Los requisitos y las decisiones de conciliación están en STOCK-FEED-V1.2-HANDOFF-2026-11-11. La propuesta original con agregados no basta por sí sola para deduplicar las dos fuentes.

## 5. Cierre del equipo en iPad — pendiente

Solo lo puede acreditar una prueba real con el personal. No se prellena `stockEnd` como sobrante medido: sigue siendo el stock al consultar y antes hay que confirmar con Valentina si ponen contadores a cero o reponen antes de la captura. Cualquier estimación futura deberá ser visible, trazable y distinta de un conteo humano; nunca confirmada automáticamente por autosave. El módulo actual mantiene la distinción vacío/cero y la confirmación de producción real.

## 6. Semana con Valentina — no iniciada

No elevar las recomendaciones a rutina estándar mientras sigan abiertos los pasos anteriores. Los recuentos y planes manuales siguen disponibles. Las cantidades del Excel son cantidades de producción que incluyen sobrantes previstos; la comparación deberá separar ventas, producción real y sobrantes, sin tratar el par como demanda pura.

## Verificación técnica de esta corrección

84 tests de stock/compras/login más 10 de Passport correctos, incluido el rechazo de enlaces Thanksgiving y el timeout con reloj simulado. ESLint, TypeScript y build de producción correctos. HTTP de stock y recorrido de navegador con base aislada correctos: recuento, guardado/recarga, cierre rápido, reintento, conflicto entre dispositivos, motivos del plan, valores recurrentes y móvil de 320 px. El entorno restringido bloqueaba la compilación y las conexiones/arranque del navegador; las mismas comprobaciones se completaron con ejecución autorizada. No se alteraron las comprobaciones para hacerlas pasar ni se escribieron registros de prueba en producción.

## Publicación

Publicada el 11 de noviembre mediante `npm run deploy:production` desde main limpio, integrado y coincidente con origin/main: `f1b7f7f2bec48f17d71b55fe9e93b46664e6febd`, feature `01b165b`. Vercel `dpl_At4eH37m4S5wdYGqM3x1pGEH5xK8`, READY, target production y alias canónico confirmados mediante el conector Vercel. Login 200, página privada 307 y APIs/guía 401 sin sesión. Inventario remoto: 215 archivos, dos guías esperadas y ningún archivo privado inesperado de entorno/output/tmp. Consulta de logs de error: sin entradas para el despliegue en el intervalo consultado.

Esta publicación incorpora únicamente timeout y protecciones de asociaciones; NO implementa v1.2 ni resuelve el doble conteo de pedidos futuros. La coordinación está preparada para que Aitor la entregue a Claude; no se ha enviado un mensaje externo ni modificado el repositorio de la web.

## Confirmación posterior de Claude — contrato y cierre del 28 de octubre

Claude entrega §4.7: v1.2 construida en la web y pendiente de autorización de su despliegue. Confirma que `onlinePickups[].orderId` coincide con `order_id` de la Sheet. La adaptación del consumidor sigue pendiente; los nuevos campos se descartan actualmente por la lista de campos permitidos, por lo que publicar la web por sí solo no corrige el cálculo del dashboard.

Claude identifica las 12 unidades del 28 de octubre como una venta real de POS a las 07:59. Se conserva la venta y, según la instrucción recibida de Aitor, se registra el evento global `closure-2026-10-28`, cerrado, factor 0, exclusivamente para esa fecha. Se utiliza el servicio de eventos validado y auditado, con actor `Aitor (via Codex)`. La lectura posterior confirma el evento y una huella idéntica de la captura y las ventas materializadas antes/después: un pedido pagado, 12 unidades en el registro de origen. No se ha convertido el día en cero, borrado ventas, cambiado planes ni añadido cierres humanos ficticios. El motor ya excluye los eventos de cierre de su muestra normal.

Se ha vuelto a comprobar que la URL canónica sigue apuntando al despliegue READY `dpl_At4eH37m4S5wdYGqM3x1pGEH5xK8`, commit de aplicación `f1b7f7f2bec48f17d71b55fe9e93b46664e6febd`, con timeout de 30 s y protección de Thanksgiving. No hace falta repetir el despliegue para esas dos correcciones.
