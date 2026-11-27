# Edge Functions

## Notificaciones push de pedidos y plan

La app ya puede mostrar avisos mientras Gloto está abierta. Para que un pedido
llegue a un dispositivo aunque la app esté cerrada y enviar recordatorios del
plan durante el periodo de gracia, prepara Web Push:

1. Aplica la migración
   `supabase/migrations/20261126160000_order_push_subscriptions.sql` y
   `supabase/migrations/20261126190000_business_plan_push_deliveries.sql`.
2. Genera un par de claves VAPID con `npx web-push generate-vapid-keys` y un
   secreto aleatorio para el webhook. Conserva la clave privada y el secreto
   solo en el entorno seguro de Supabase.
3. Configura los secretos y publica la función:

   ```sh
   supabase secrets set VAPID_PUBLIC_KEY=CLAVE_PUBLICA VAPID_PRIVATE_KEY=CLAVE_PRIVADA VAPID_SUBJECT=mailto:soporte@tu-dominio.com ORDER_PUSH_WEBHOOK_SECRET=SECRETO_ALEATORIO
   supabase functions deploy send-order-push --no-verify-jwt
   supabase functions deploy send-plan-push --no-verify-jwt
   ```

4. Configura `VITE_VAPID_PUBLIC_KEY` con la clave pública en el `.env` local y
   en las variables de entorno del hosting; reconstruye y publica el frontend.
   Esta clave es pública. Nunca pongas `VAPID_PRIVATE_KEY` ni
   `ORDER_PUSH_WEBHOOK_SECRET` en el frontend.
5. En Supabase, crea un Database Webhook para `public.orders`, evento `INSERT`,
   con URL `https://TU_PROYECTO.supabase.co/functions/v1/send-order-push` y el
   header personalizado `x-gloto-order-push-secret` con el mismo secreto
   configurado arriba.

Push está disponible solo para negocios con plan Pro o Premium. Los avisos de
pedidos se envían mientras ese plan está vigente y se pausan al vencer. El
recordatorio de vencimiento se envía una vez al día durante los tres días de
gracia, solo para suscripciones Pro/Premium. Los avisos de stock también
requieren un plan Pro/Premium vigente. Durante la gracia solo se envía el
recordatorio del plan. Las reservas y otros canales no generan push.

El push de pedido muestra **Nuevo Pedido (nombre de la tienda)** como título y
el método de entrega, nombre del cliente y número de pedido en el texto. El
push de vencimiento muestra los días restantes para la suspensión y avisa que
el plan se cancelará si no se renueva dentro de los tres días de gracia. El push
de stock avisa una sola vez cuando la cantidad baja desde encima del mínimo
configurado hasta el mínimo o menos; si no hay mínimo, se usa cero. Solo vuelve
a avisar después de reponer el producto por encima del mínimo y que vuelva a
cruzarlo hacia abajo. No usa revisiones programadas ni consultas periódicas.

Los canales de pedido se configuran en **POS > Configuración > Notificaciones
push**: Marketplace respeta `notify_marketplace_orders`; POS respeta
`notify_pos_orders` (desactivado por defecto). **Pop pup** solo configura el
botón flotante, su color y el sonido dentro de Gloto. Al tocar un push de pedido
se abre la orden; el push del plan abre **Mi plan**. Los permisos del navegador
y del sistema operativo siguen siendo necesarios; en iOS se debe instalar la
app web para recibir push.

Para probar pedidos, usa un negocio Pro/Premium vigente, activa push en un
dispositivo y crea un pedido nuevo de Marketplace con
`notify_marketplace_orders` activo. Para probar avisos de plan, configura el job
diario de abajo y usa un negocio Pro/Premium cuyo plan esté en el periodo de
gracia. Los pedidos del POS solo llegan cuando `notify_pos_orders` está activo y
el plan sigue vigente.

### Programar recordatorios diarios del plan

Despliega `send-plan-push` y aplica las migraciones antes de crear el trabajo.
En Supabase, habilita `pg_cron`, `pg_net` y Vault desde **Database > Extensions**.
Guarda en Vault el mismo valor de `ORDER_PUSH_WEBHOOK_SECRET` usado por la Edge
Function y el Database Webhook; ejecuta este paso una sola vez en SQL Editor:

```sql
select vault.create_secret(
  'PEGA_AQUI_EL_VALOR_DE_ORDER_PUSH_WEBHOOK_SECRET',
  'gloto_order_push_secret',
  'Secret for the daily plan push job'
);
```

Programa una llamada diaria a las 9:00 a. m. de Colombia (14:00 UTC):

```sql
select cron.schedule(
  'gloto-send-plan-push-daily',
  '0 14 * * *',
  $$
    select net.http_post(
      url := 'https://TU_PROYECTO.supabase.co/functions/v1/send-plan-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-gloto-order-push-secret',
        (select decrypted_secret
         from vault.decrypted_secrets
         where name = 'gloto_order_push_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

El trabajo registra cada entrega por suscripción, dispositivo y día de gracia
para evitar repetirla si la tarea se ejecuta más de una vez. No guardes el valor
real del secreto en Git.

### Activar avisos de stock agotado

Aplica `supabase/migrations/20261126193200_stock_push_notifications.sql` y
despliega la función:

```sh
supabase functions deploy send-stock-push --no-verify-jwt
```

En Supabase, crea un Database Webhook para `public.products`, evento `UPDATE`,
con URL `https://TU_PROYECTO.supabase.co/functions/v1/send-stock-push` y el
header personalizado `x-gloto-order-push-secret` con el mismo secreto del
webhook de pedidos. El webhook es por cambio en la base de datos; la función
solo envía un push cuando el stock cruza el mínimo hacia abajo y la opción
**Productos en su límite de stock** está activada. La preferencia viene apagada
por defecto. Actualiza el frontend en Vercel para mostrar el interruptor.

### App y avisos para domiciliarios

Aplica la migración `supabase/migrations/20261126213000_courier_push_subscriptions.sql`
y despliega la función:

```sh
supabase functions deploy send-courier-push --no-verify-jwt
```

En Supabase, crea un Database Webhook para `public.courier_order_dispatches`,
evento `UPDATE`, con URL
`https://TU_PROYECTO.supabase.co/functions/v1/send-courier-push` y el mismo
header `x-gloto-order-push-secret` configurado para los demás webhooks. El push
se envía únicamente al domiciliario al que se le asigna una oferta activa.
Para ofertas públicas, el aviso dice **Domicilios disponibles**. Para ofertas
de tienda, muestra el nombre de la tienda y el total de pedidos disponibles.
Cada tipo de aviso reutiliza una etiqueta de notificación por domiciliario
(y por tienda), de modo que un aviso nuevo reemplaza al anterior del mismo
grupo en vez de acumularlos en la bandeja. La notificación se abre en
`/domiciliarios`.

Cada domiciliario debe entrar en su cuenta, abrir el menú del portal y activar
**Avisos de domicilios** en cada dispositivo. La suscripción se guarda separada
de las de los negocios. Desde ese menú también puede instalar **Gloto
Domiciliarios**, que usa un nombre, icono y ruta de inicio propios; la
instalación requiere confirmación del navegador. En iPhone, se instala desde
Safari con **Compartir > Añadir a pantalla de inicio**. Para recibir push en
iPhone/iPad se requiere iOS/iPadOS 16.4 o posterior, abrir la app desde el icono
instalado y conceder el permiso desde el botón **Activar avisos de domicilios**.
Safari en una pestaña normal no permite crear la suscripción Web Push de la PWA.
Si el permiso se había bloqueado, habilítalo en los ajustes de notificaciones
del dispositivo para Gloto Domiciliarios. Al cambiar el icono, elimina la app
anterior de la pantalla de inicio y vuelve a instalarla para refrescar el icono
almacenado por iOS.

En POS, **Cambiar a cuenta de domiciliario** cierra la sesión actual y abre el
login de domiciliarios; en el portal de domiciliarios, **Cambiar a cuenta del
POS** hace lo equivalente. Son cuentas separadas: se deben introducir las
credenciales de la otra cuenta y no se transfieren permisos entre ellas.

Para ver el push sin cambiar la fecha del plan ni notificar a otras tiendas,
despliega la función actualizada y ejecuta en SQL Editor una prueba dirigida a
un negocio de pruebas Pro/Premium que tenga un dispositivo suscrito:

```sql
select net.http_post(
  url := 'https://TU_PROYECTO.supabase.co/functions/v1/send-plan-push',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-gloto-order-push-secret',
    (select decrypted_secret
     from vault.decrypted_secrets
     where name = 'gloto_order_push_secret')
  ),
  body := jsonb_build_object(
    'test_business_id',
    'UUID_DEL_NEGOCIO_DE_PRUEBA'
  )
);
```

La prueba muestra el texto del primer día de gracia, no modifica la suscripción
ni registra una entrega diaria real.

## Acceso por plan y límite de tickets

Ejecuta `supabase/115_plan_feature_and_ticket_limits.sql` en el SQL Editor antes
de publicar el frontend que depende del control de planes. La migración habilita
inventario solo para Pro y Premium, limita Inicial a 1.000 tickets por ciclo y
Pro a 2.000, y deja Premium sin límite. Cuenta ventas del POS y de la tienda
online, excluye reservas y conserva el consumo aunque una orden se archive y
elimine. Al agotarse el cupo, se rechazan nuevas ventas; el historial permanece
disponible y el consumidor recibe un aviso para intentarlo más tarde.

## Preparar cuentas y configuración inicial

Antes del primer despliegue, ejecuta `supabase/114_business_account_onboarding.sql`
en el SQL Editor de Supabase. Agrega el indicador de configuración inicial y
una función que solo la marca como completa después de validar los datos
operativos requeridos. Las cuentas actuales quedan marcadas como completas;
las nuevas cuentas empiezan pendientes.

Las Edge Functions solo permiten solicitudes de una sesión válida cuyo perfil
en `public.profiles` tenga el rol interno de administración. Usan las variables
administrativas proporcionadas por Supabase; ninguna clave de servicio se
configura en el frontend.

```sh
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy crear-cuenta-negocio
supabase functions deploy eliminar-cuenta-negocio
supabase functions deploy restablecer-contrasena-negocio
supabase functions deploy crear-cuenta-domiciliario
```

La configuración de `crear-cuenta-domiciliario` desactiva la verificación JWT
del gateway para que la solicitud CORS `OPTIONS` pueda llegar a la función. La
función valida la sesión del solicitante con `auth.getUser()` y exige un perfil
`admin` con `business_id` antes de crear una cuenta. Despliega desde la raíz del
proyecto con Supabase CLI para que se aplique `supabase/config.toml`; si la
verificación JWT se cambió desde el Dashboard, desactívala para esta función
para que coincida con esa configuración.

## Portal privado de domiciliarios

Ejecuta `supabase/123_domiciliarios_privados.sql` en el SQL Editor antes de
publicar el portal. Agrega el vínculo seguro entre un empleado y su cuenta,
además de funciones protegidas para consultar, tomar y actualizar pedidos de
domicilio. Los domiciliarios quedan sin `business_id` en su perfil; el negocio
se resuelve mediante el empleado vinculado, de modo que no obtengan acceso a
las demás pantallas ni datos del POS. Si en el futuro se necesita eliminar
usuarios de Auth, ejecuta también estas migraciones para conservar el historial
de revisiones y eliminar el perfil asociado:
`supabase/113_auth_user_review_references_set_null.sql` y
`supabase/124_profiles_auth_user_cascade.sql`. La segunda permite que Auth
elimine automáticamente el perfil asociado.
Ejecuta además `supabase/125_domiciliario_read_own_employee.sql` para que cada
domiciliario pueda leer únicamente el registro de empleado vinculado a su cuenta.
Ejecuta `supabase/126_detach_domiciliario_from_business.sql` para permitir que
el acceso a una tienda se quite de forma transaccional sin eliminar la cuenta
global de Gloto. Ejecuta también
`supabase/127_remove_employee_from_business.sql` para habilitar la eliminación
del registro del empleado; si tenía cuenta de domiciliario, la cuenta de Gloto
se conserva y sus domicilios activos se liberan.

El dueño crea el empleado desde **Configuración > Empleados**, selecciona el
área **Domiciliario/a** y genera su acceso con correo y contraseña inicial. En
la misma sección puede restablecer la contraseña o quitar el acceso. Al quitar
el acceso a una tienda, se desvincula la cuenta únicamente de ese empleado, se
conserva la cuenta de Auth y la contraseña no cambia. El empleado se conserva y
sus domicilios asignados vuelven a estar disponibles para el negocio. El
restablecimiento solo se puede hacer mientras la cuenta siga vinculada al
empleado. En esta primera fase el portal solo muestra pedidos del negocio que
creó esa cuenta. La publicación de pedidos para domiciliarios públicos y sus
recargas no está habilitada todavía.

Crear, restablecer y quitar el vínculo son acciones de la misma Edge Function
`crear-cuenta-domiciliario`; por eso Supabase muestra un solo nombre en la lista
de funciones. Desde **Configuración > Empleados**, **Restablecer** cambia la
contraseña de la cuenta mientras siga vinculada al negocio. **Quitar acceso**
revoca únicamente el acceso a los pedidos de esa tienda; no borra al usuario de
Supabase Auth ni le cambia la contraseña.

Después de ejecutar el SQL, despliega o actualiza la función desde la carpeta
del proyecto que contiene `supabase/config.toml`:

```sh
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy crear-cuenta-domiciliario
```

La misma función elimina el registro laboral desde **Empleados**. Antes de
usarlo, ejecuta `supabase/127_remove_employee_from_business.sql`; la cuenta
global de Gloto del domiciliario se conserva y solo se libera su vínculo y los
domicilios de esta tienda.

La clave `SUPABASE_SERVICE_ROLE_KEY` se usa únicamente dentro del entorno
administrado de Edge Functions; no se debe copiar al navegador ni al SQL Editor.

En la sección de creación de cuentas, el usuario de administración ingresa el nombre, slug y correo
del negocio. La función crea el negocio, un usuario confirmado en Auth y su
perfil con rol `admin`; asigna el plan Inicial mensual activo por 30 días sin
registrar un pago; genera una contraseña temporal aleatoria que se muestra una
sola vez para copiarla y compartirla de forma privada. La cuenta queda obligada
a cambiarla en el primer acceso.

En el primer ingreso, la persona cambia la contraseña y completa nombre,
categoría, dirección, WhatsApp, tiempos y costos de domicilio y ubicación. La
aplicación bloquea el POS hasta que esos datos queden guardados. Logo, portada,
horarios, categorías de productos e inventario se pueden configurar después.

La función `eliminar-cuenta-negocio` también requiere una sesión válida de
administración. Elimina permanentemente el negocio, los perfiles y los usuarios
vinculados, además de los archivos asociados. Antes de habilitar la eliminación,
ejecuta `supabase/113_auth_user_review_references_set_null.sql` en el SQL Editor
de Supabase; conserva el historial financiero, pero permite eliminar las
referencias de revisores en `reviewed_by`.

La función `restablecer-contrasena-negocio` permite al equipo de administración emitir una
contraseña temporal nueva para un administrador específico de la tienda. La
contraseña se devuelve una sola vez y la cuenta queda obligada a cambiarla al
iniciar sesión. No se almacenan contraseñas legibles ni se puede consultar la
contraseña anterior.

## Solicitudes de cambio de contraseña

La pantalla **Configuración > Datos** no muestra ni cambia contraseñas.
Quien necesite recuperar el acceso debe comunicarse con el equipo de soporte por
el canal oficial de atención. El personal autorizado puede emitir una
contraseña temporal con `restablecer-contrasena-negocio`; se muestra una sola
vez y la cuenta debe cambiarla al iniciar sesión. No se necesita guardar
contraseñas en tablas ni configurar flujos de recuperación por correo para esta
pantalla.

El login público usa el número configurado en **Admin > Sistema** para abrir
WhatsApp con un mensaje de recuperación de credenciales. En el login de
domiciliarios también aparece la opción para consultar por el registro público;
ese flujo aún no está implementado y se gestiona por soporte. Ejecuta
`supabase/128_public_support_whatsapp_rpc.sql` para que el login pueda leer solo
el número global de soporte sin exponer permisos sobre la tabla de configuración.
