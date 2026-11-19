# Seguridad en la recogida y entrega de pedidos con códigos

## Objetivo

Evitar que un domiciliario marque un pedido como recogido o entregado sin
confirmar el paso con la persona que corresponde. Cada transición requiere un
código aleatorio de **4 dígitos**, validado en el servidor:

1. **Recogida en la tienda:** el domiciliario solicita el código al personal de
   la tienda y lo introduce en su portal.
2. **Entrega al cliente:** el cliente comunica su código al domiciliario, quien
   lo introduce antes de finalizar el pedido.

El código no sustituye la asignación del pedido ni la autenticación del
domiciliario. Es una confirmación adicional para vincular cada cambio de estado
con la tienda o el cliente.

## Cómo encaja con el flujo actual

El portal de domiciliarios ya toma pedidos y actualiza sus estados mediante
funciones RPC de Supabase. Los estados de entrega relevantes son `assigned`,
`picked_up` y `delivered`; existen flujos para pedidos de tienda y para pedidos
públicos.

La propuesta conserva esa secuencia:

```text
available -- aceptar pedido --> assigned
assigned  -- código de recogida válido --> picked_up
picked_up -- código de entrega válido --> delivered
```

Aceptar un pedido **no** debe contar como recogerlo. Los métodos de recogida en
tienda por parte del cliente, pedidos en mesa y otros que no sean entregas con
domiciliario quedan fuera de este control.

## Experiencia propuesta

### 1. Recogida en la tienda

1. Al asignarse el domiciliario, el servidor genera un código de recogida de
   cuatro dígitos.
2. El personal autorizado lo consulta en **POS > Órdenes > detalle del pedido
   de domicilio**, en un bloque llamado **Código de recogida para el
   domiciliario**. Aparece cuando el domicilio ya está asignado. No se muestra
   en la lista general, factura, seguimiento del cliente ni pantalla del
   domiciliario.
3. En el portal, el domiciliario pulsa **Recogí el pedido**, introduce el código
   y confirma.
4. El servidor valida el código y la asignación. Solo si ambas son válidas
   cambia `delivery_status` de `assigned` a `picked_up`.
5. Si el código no coincide, el pedido conserva su estado y el portal muestra
   un mensaje para volver a intentarlo.

El personal de la tienda debe entregar el código al domiciliario cuando le
entrega físicamente el pedido.

### 2. Entrega al cliente

1. El servidor genera un código de entrega distinto al de recogida.
2. El cliente lo ve en el **seguimiento privado del pedido**, debajo del estado
   del pedido cuando aparece **En camino** (después de confirmar la recogida).
   Se muestra en un bloque llamado **Código para recibir tu pedido**. La página
   lo obtiene mediante una operación específica que valida el token de
   seguimiento del cliente; no se añade a la consulta general del pedido.
3. El código no se incluye en las respuestas del portal del domiciliario, en
   las funciones generales de listado de pedidos ni en las notificaciones
   visibles para el domiciliario.
4. Al llegar, el domiciliario solicita el código al cliente y lo introduce en
   el portal.
5. El servidor valida el código y que el domiciliario tenga asignado ese pedido.
   Solo entonces cambia el estado a `delivered`.

El código de entrega debe estar disponible para el cliente antes de que el
domiciliario lo solicite, pero no en los datos que recibe el domiciliario.

## Cambios técnicos previstos

### Base de datos y generación de códigos

- Añadir una tabla privada de verificaciones asociada al pedido y al propósito
  (`pickup` o `delivery`), en vez de añadir campos a las respuestas generales
  de pedidos.
- Guardar el digest del código para validarlo, nunca el código en texto claro.
  Como solo hay 10.000 combinaciones posibles, el digest debe ser un HMAC con
  una clave privada no accesible a roles de aplicación; un hash sin clave no es
  suficiente ante una filtración de la base de datos.
- Si la experiencia requiere volver a mostrar el código, guardar además una
  copia cifrada con esa clave. Descifrarla solo mediante una operación
  autorizada para la tienda o el cliente, según el propósito.
- Generar los dígitos con un generador criptográficamente seguro y conservar
  ceros iniciales (`0042` es un código válido).
- Crear códigos de forma idempotente para evitar que reintentos técnicos
  generen códigos nuevos inesperadamente. Al cancelar o reasignar un pedido,
  invalidar los códigos anteriores y emitir los que correspondan a la nueva
  asignación. No vencen por tiempo: dejan de servir al validarse, cancelarse o
  invalidarse por reasignación.
- Nunca incluir códigos, códigos introducidos ni valores descifrados en logs,
  mensajes de error, eventos de tiempo real o analítica.

La tabla debe impedir más de un código activo por pedido y propósito y registrar
los datos mínimos de auditoría: pedido, propósito, fecha de creación,
verificación, intentos fallidos y actor que completó la verificación. Nunca se
debe guardar el valor que el domiciliario escribió.

### ¿Se pueden acabar los códigos?

No. `0000` a `9999` son las 10.000 posibilidades para generar un código, no una
lista que se consume en orden. Se genera un código aleatorio para cada
verificación y se vuelve inutilizable cuando se valida, se cancela el pedido o
se invalida por una reasignación. Después, ese mismo valor puede volver a
generarse para otro pedido.

La validación siempre relaciona el código con el **pedido**, su propósito
(`pickup` o `delivery`), el estado esperado y el domiciliario asignado. Por eso
no hace falta que cada código sea único para siempre, ni siquiera que sea único
entre todos los pedidos activos: dos pedidos distintos pueden tener el mismo
código sin que el código de uno sirva para completar el otro. Se debe evitar
exigir unicidad global, porque eso sí impondría un límite innecesario de 10.000
códigos activos.

La generación no avanza como un contador y no requiere una operación manual de
“reinicio”. La seguridad depende de limitar los intentos para cada pedido y
propósito, no de reservar cada número para toda la vida del sistema.

### Validación en el servidor

Adaptar las funciones RPC existentes que asignan y cambian el estado de pedidos
privados y públicos. La transición de estado y la verificación del código deben
ocurrir en una sola transacción:

- `assigned` a `picked_up`: exigir código de recogida.
- `picked_up` a `delivered`: exigir código de entrega.
- Rechazar códigos ausentes, incorrectos, ya usados o de otro pedido.
- Confirmar en servidor que `auth.uid()` corresponde al domiciliario asignado,
  que el pedido admite esa transición y que no fue cancelado o reasignado.
- Consumir el código al validarlo y cambiar el estado atómicamente. Dos
  solicitudes simultáneas no deben poder validar el mismo paso dos veces.
- Aplicar las mismas reglas a ambos tipos de pedido: de tienda y público.
- Impedir que otra ruta de escritura permita marcar una entrega como recogida o
  entregada sin pasar por esta validación. Las excepciones administrativas, si
  se necesitan, deben ser explícitas, autorizadas y auditadas.

La validación no debe depender únicamente del formulario del portal. Un cliente
podría evitar o modificar esa interfaz; la base de datos debe rechazar siempre
la transición sin código válido.

### Protección ante intentos y exposición

- Limitar los intentos fallidos por pedido y por domiciliario. Se permiten
  **5 intentos**; después, bloquear la verificación durante **15 minutos**.
  Cumplido ese plazo, el siguiente intento reinicia el contador.
- No borrar ni cambiar el código ante un error de digitación.
- No devolver el digest, el código cifrado ni el código de entrega a funciones
  que consultan pedidos para domiciliarios.
- Mostrar el código de recogida solo a empleados autorizados del negocio
  asociado al pedido; mostrar el de entrega solo al cliente mediante el canal
  de seguimiento autorizado.
- Registrar los intentos y las verificaciones sin incluir el código escrito.

El límite de intentos y el tiempo de bloqueo son valores iniciales y pueden
ajustarse antes de desplegar la migración.

## Archivos y áreas actualizados

- `modulos/empleados/PortalDomiciliario.jsx`: pedir el código antes de ejecutar
  **Recogí el pedido** y **Entregado**, mostrar errores del servidor y no
  cambiar la interfaz a estado completado antes de recibir confirmación.
- `modulos/pos/Ordenes.jsx`: mostrar el bloque **Código de recogida para el
  domiciliario** al detalle de cada pedido de domicilio asignado, visible solo
  para personal autorizado del negocio. La interfaz tampoco debe permitir al
  personal marcar manualmente recogido o entregado.
- `modulos/marketplace/pages/SeguimientoPedido.jsx`: añadir el bloque **Código
  para recibir tu pedido** debajo del estado **En camino**, consultándolo solo
  mediante el token privado de seguimiento del cliente.
- `supabase/migrations/20261117030000_courier_order_verification_codes.sql`:
  crear la tabla privada y su auditoría, la clave aleatoria de servidor dentro
  del esquema privado `gloto_private`, los RPC de consulta autorizada y
  verificación, y los triggers que impiden omitir el código.

Las referencias actuales del flujo incluyen `claim_domiciliario_order`,
`claim_public_courier_order`, `set_domiciliario_order_status` y
`set_public_courier_order_status`. El nuevo RPC
`complete_courier_order_step` valida el código y ejecuta la función de estado
correspondiente para ambas modalidades.

## Despliegue y verificación pendiente

Antes de habilitar el flujo en producción, aplicar la migración en Supabase y
probar los casos de éxito, error, reintento, concurrencia, reasignación y acceso
no autorizado. Si ya se había aplicado la primera versión, también debe
aplicarse la migración correctiva
`supabase/migrations/20261117040000_allow_kitchen_complete_for_delivery_orders.sql`:
el estado `complete` de Cocina significa preparación lista, no entrega al
cliente.

## Criterios de aceptación

- Un pedido asignado no puede pasar a `picked_up` sin el código correcto de
  recogida.
- Un pedido recogido no puede pasar a `delivered` sin el código correcto de
  entrega.
- Un código de recogida no sirve para entregar, ni viceversa; tampoco sirve en
  otro pedido o después de usarse.
- Un código incorrecto, una sesión de otro domiciliario o una solicitud
  repetida no cambia el estado.
- El domiciliario no puede consultar ninguno de los códigos mediante sus
  funciones de listado, historial, mapa o tiempo real.
- El cliente no puede consultar el código de entrega de otro pedido y la tienda
  no puede consultar el código de recogida de otro negocio.
- La interfaz solo muestra el nuevo estado después de que Supabase confirme la
  operación.
- Los pedidos públicos y los asignados directamente por una tienda aplican las
  mismas verificaciones.

## Estado de implementación

La migración y los cambios de interfaz están en el repositorio, pero todavía no
están aplicados a la base de datos desplegada. La clave se guarda en una tabla
de un esquema privado sin permisos para `anon` ni `authenticated`, por lo que
esta migración no depende de Supabase Vault. Hasta aplicar y validar la
migración, las pantallas no podrán consultar ni verificar códigos.
