# Consumidor del feed v1.2

GET real firmado del 2026-11-10: HTTP 200, día completo, 133 artículos y ocho líneas `onlinePickups`. Ejemplo: Almond Croissant (Thanksgiving), mostrador 0, online 2, SameDay 0, OtherDay 2, `hourlyInStore` vacío. La respuesta pasa el nuevo parser. No se publican firmas, referencias de pedidos ni datos personales.

## Comportamiento

- Se validan y conservan los campos permitidos de §4.7. Se rechazan splits inconsistentes, campos v1.2 incompletos, fechas imposibles y duplicados de pedido/artículo. Un endpoint que vuelva a v1.1 falla sin rebajar capturas v1.2 ya almacenadas.
- El registro de ventas y las comparaciones mantienen sus unidades por fecha de pago. La base del plan usa exclusivamente `unitsInStore + unitsOnlineSameDay`. Los días antiguos sin desglose v1.2 quedan fuera de la muestra, con aviso; nunca se interpreta el online total como SameDay.
- La curva de agotado usa `hourlyInStore` dividido por unidades de mostrador. La corrección afecta solo al mostrador, sin multiplicar los pagos online del mismo día por una pérdida de ventas de mostrador.
- Se leen recogidas de todas las capturas almacenadas. Para cada `orderId` se conservan todos los artículos del feed y se excluye la fila completa de la Sheet con ese `order_id`. Dos pedidos distintos de iguales cantidades siguen siendo dos pedidos. Las filas telefónicas/presenciales restantes conservan sus validaciones.
- Las referencias opacas vistas en el feed se conservan solo en la tabla privada `stock_pickup_order_sources`. Si una devolución elimina una obligación de una captura refrescada, una copia antigua paid de la Sheet no la resucita. No se guardan emails, nombres de cliente, notas, direcciones ni cuerpos de correo. Las referencias no salen en DTOs, explicaciones ni logs.
- Se exigen los 90 días completos v1.2 para aceptar recomendaciones con encargos conciliados. Las capturas completas v1.1 también se vuelven a solicitar, en secuencia y dentro del presupuesto existente. No se modifican planes manuales ni recuentos.
- Releer sustituye la captura y sus obligaciones. Una actualización concurrente del feed mientras se carga la Sheet cambia la huella del contexto e impide guardar una recomendación calculada con fuentes distintas.
- Thanksgiving sigue separado del vínculo diario. Una obligación de campaña sin correspondencia de producción confirmada queda pendiente y bloquea aceptar una recomendación incompleta. No se inventan asociaciones eliminando palabras del nombre. Los planes manuales siguen disponibles.
- Review avisa de que las ventas se atribuyen al pago. Los planes v1.2 no se comparan en bias/WMAPE contra ese registro de otra fecha; la precisión queda pendiente de demanda comparable por recogida. No se fabrican métricas favorables.

## Límites

Claude confirma `onlinePickups[].orderId = Sheet.order_id`. El feed solo enumera recogidas de otros días y clasifica recogidas desconocidas muy antiguas como SameDay según §4.7; no se corrige esa limitación por intuición. La ventana automática de devoluciones sigue siendo siete días: para cambios anteriores hay que refrescar expresamente la captura afectada. Los pedidos de la Sheet del mismo día siguen el contrato acordado; no se atribuyen por nombre/importe a pedidos ajenos.

No se hacen pedidos ni escrituras en Clover o disponibilidad de la web. Se mantiene el cierre del 28 de octubre y sus 12 unidades reales. Personal, correspondencias pendientes e informes independientes de Clover siguen siendo aceptaciones de negocio separadas.

## Pruebas

Parser y privacidad; pedidos de varios artículos; pedidos iguales legítimos; cambio de fecha; cobertura incompleta; campaña sin asociar; conflictos; relectura idempotente; devolución sin resurrección desde Sheet; preservación del registro por pago; base 10 + 2 sin 50 unidades futuras; curva con denominador de mostrador y métricas comparables. Regresiones completas: 90 tests stock/compras/login y 10 Passport, build, TypeScript y ESLint.
