# Rollout: códigos para recogida y entrega

Este directorio agrupa las instrucciones para pausar el cambio actual y
desplegarlo más adelante de forma coordinada. Los archivos aquí son guías
operativas; **no** son migraciones automáticas de Supabase.

## Situación actual

- Los cambios de React siguen en el árbol de trabajo local y no afectan al
  sitio publicado hasta desplegar el frontend.
- El mensaje observado en Cocina confirma que la función de protección SQL de
  la migración `20261117030000_courier_order_verification_codes.sql` ya está
  activa en la base conectada. Por tanto, aunque el frontend nuevo no se haya
  publicado, la base de datos de producción sí recibió un cambio.
- Esa protección puede bloquear el flujo anterior del domiciliario; la primera
  versión también confundía el estado `complete` de Cocina con una entrega
  final.
- La migración `20261117040000_allow_kitchen_complete_for_delivery_orders.sql`
  corrige la confusión de Cocina, pero no restaura el flujo anterior del
  domiciliario.

## Si se necesita restaurar producción al comportamiento anterior

1. Abrir el proyecto correcto en Supabase y confirmar que es la base de datos
   de producción.
2. Ejecutar el contenido de `ROLLBACK_PRODUCTION.sql` en SQL Editor.
3. Confirmar que Cocina vuelve a mover los pedidos a `complete` y que el flujo
   anterior de domicilios puede cambiar sus estados.
4. No ejecutar todavía las migraciones de avance ni publicar los cambios de
   interfaz.

El rollback quita los triggers que aplican los códigos y deshabilita el acceso
a los nuevos RPC de códigos. **No borra** la tabla privada, los códigos o los
eventos ya almacenados. Los objetos quedan sin uso para poder conservar los
datos mientras se prepara la versión completa.

## Archivos de avance que se aplicarán juntos más adelante

- `../../migrations/20261117030000_courier_order_verification_codes.sql`
- `../../migrations/20261117040000_allow_kitchen_complete_for_delivery_orders.sql`
- Cambios del frontend en:
  - `modulos/empleados/PortalDomiciliario.jsx`
  - `modulos/pos/Ordenes.jsx`
  - `modulos/marketplace/pages/SeguimientoPedido.jsx`

Los archivos SQL anteriores son migraciones versionadas, no se deben copiar a
este directorio ni ejecutar en producción hasta completar las pruebas en una
base de staging.

## Lista antes del despliegue futuro

1. Probar en staging los pedidos de tienda y públicos, desde asignación hasta
   recogida y entrega.
2. Confirmar que Cocina mantiene `complete` como "preparación lista".
3. Probar código incorrecto, ceros iniciales, cinco intentos, bloqueo,
   reasignación, cancelación, concurrencia y permisos entre negocios.
4. Desplegar las migraciones de avance y el frontend nuevo de forma coordinada;
   no dejar la nueva exigencia de códigos activa con el portal antiguo.
5. Verificar los códigos en el POS y el seguimiento privado del cliente antes
   de habilitar el cambio a todos los negocios.

## Alcance

Este paquete no se conecta a Supabase, no ejecuta SQL y no publica archivos.
