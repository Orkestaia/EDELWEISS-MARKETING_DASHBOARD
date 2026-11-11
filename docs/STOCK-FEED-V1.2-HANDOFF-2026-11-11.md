# Coordinación con Claude: feed v1.2

2026-11-11. Aitor ha autorizado en el chat preparar la coordinación para que Claude desarrolle la propuesta v1.2 de su revisión. Este documento recoge lo necesario para acordar el contrato; no declara que el nuevo feed exista ni cambia los endpoints actuales. Claude mantiene la web y las credenciales Clover; Codex mantiene el consumidor y la planificación.

## Objetivo y cambio propuesto

Evitar que un encargo pagado el martes para recoger el viernes infle la base del martes y vuelva a sumarse el viernes. Mantener los campos v1.1 como registro por fecha de pago para no alterar consumidores existentes.

Propuesta de Claude: añadir por artículo `unitsOnlineSameDay`, `unitsOnlineOtherDay`, `hourlyInStore`; a nivel superior, `onlinePickups` con `pickupDate`, `cloverItemId`, `name`, `units`. Mantener fechas de negocio America/New_York, firmas §4.1, GET sin credenciales de Clover en el dashboard y llamadas secuenciales.

## Decisiones que necesitamos cerrar antes de implementar el consumidor

1. **Identidad para conciliar fuentes.** `pickupDate + product + units` no permite deduplicar dos pedidos iguales legítimos ni distinguir un duplicado entre feed y Sheet. Necesitamos una referencia opaca estable de pedido/línea que también exista en la Sheet, o una clasificación de origen verificable que permita excluir solo sus pedidos web ya cubiertos. No incluir nombres, email, dirección, notas libres ni enlaces de clientes. Si las referencias actuales no coinciden, acordar el puente de identidad; no usar coincidencias por importe/cantidad como certeza.
2. **Misma fecha y origen.** Confirmar si la Sheet incluye también pedidos web para el mismo día. La base propuesta `unitsInStore + unitsOnlineSameDay` ya incluye esa demanda; no sumar otra vez esos pedidos desde la Sheet. Separar pedidos telefónicos/presenciales anticipados que también puedan estar pagados en Clover: necesitan la misma regla, no basta con llamarlos "manuales".
3. **Recogida desconocida.** Definir qué ocurre cuando falta o no se puede interpretar `Pick-up:`. No clasificar silenciosamente como mismo día. Proponer un contador/estado explícito y limitar la aceptación de recomendaciones incompletas. Considerar recogidas anteriores a la fecha de pago sin corregirlas silenciosamente.
4. **Devoluciones y actualizaciones.** Definir unidades netas y eliminación/revocación de `onlinePickups` cuando cambie una captura. Su reemplazo debe ser idempotente por día de pago/origen, sin acumular duplicados al releer siete días. Reembolsos más antiguos que esa ventana requieren una forma explícita de refresco. Las devoluciones por importe siguen siendo una limitación documentada.
5. **Alcance temporal.** `onlinePickups` debe incluir las recogidas futuras de las líneas del día consultado, incluso fuera de los 14 días habituales: Thanksgiving se ha vendido desde octubre para recoger el 25 de noviembre. Hay que conservar esas obligaciones al importar/actualizar capturas; consultar solo el día de recogida no las recupera.
6. **Artículos de campaña.** Thanksgiving permanece sin asociarse a los 26 productos diarios. Para producir un encargo se necesita una relación separada y confirmada entre artículo de campaña y producto/receta; esa relación no debe materializar pagos de campaña como ventas diarias. Los productos de mostrador llamados "Seasonal Quiche" etc. siguen siendo válidos.
7. **Curvas y revisión.** `hourlyInStore` no incluye pagos online; no combinar su numerador con un total diario que sí los incluya para construir una curva. Mantener diferenciadas las comparaciones de unidades por fecha de pago y las métricas de producción/demanda por fecha de recogida.
8. **Compatibilidad y despliegue.** Confirmar señal/versionado y ejemplos de payload completos. El consumidor actual permite solo campos conocidos y descarta los nuevos: publicar la web no activará automáticamente v1.2 en el dashboard. Primero probar la respuesta aditiva en la web, después integrar el consumidor y reprocesar capturas con la nueva semántica; conservar planes manuales y auditoría. No anunciar resuelto el doble conteo hasta comprobar ambos extremos.

## Ejemplos de aceptación a compartir, sin datos personales

- Pago martes, recogida viernes: excluido de base del martes; aparece una sola vez en obligaciones del viernes aunque también esté en la Sheet. Releer las capturas no cambia esa cantidad.
- Dos pedidos legítimos con igual producto/cantidad/fecha se mantienen como dos pedidos; un mismo pedido repetido en dos fuentes se cuenta una vez.
- Pedido del mismo día ya incluido en `unitsOnlineSameDay` no vuelve a añadirse desde la Sheet.
- Devolución/cancelación actualiza la obligación correcta y el registro de pago, sin crear ventas negativas ficticias ni borrar historia.
- Thanksgiving no altera la base diaria; su recogida usa únicamente obligaciones confirmadas y una relación de producción separada.
- Campos ausentes/inconsistentes, notas ilegibles y fuentes no conciliables quedan visibles y no equivalen a cero encargos.

## Resultado de la comprobación inicial que debe revisar Claude

El 11 de noviembre el feed y la captura del **2026-10-28** coinciden en **1 pedido pagado y 12 unidades**, todas marcadas `unitsInStore`: Almond Croissant, Berliner, Chocolate Croissant, Nuss Schnecken, Scone y Vanilla Crème Croissant, dos de cada. Por tanto no podemos validar ese día como cero ventas como propone §5.3. Comprobar si es pedido real, prueba o clasificación errónea y contrastarlo con Clover Reporting antes de excluirlo. No se han cambiado datos ni filtrado pedidos adivinando su origen.

Necesitamos además los informes de unidades de Clover para las cinco fechas indicadas en el registro de validación, confirmación de las siete asociaciones pendientes y un pedido futuro identificado por referencia/producto/cantidad/fechas sin datos de cliente. No crear un cobro real para esta prueba sin coordinación explícita del propietario.
