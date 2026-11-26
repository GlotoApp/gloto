# Edge Functions

## Notificaciones push de pedidos

La app ya puede mostrar avisos mientras Gloto está abierta. Para que un pedido
llegue a un dispositivo aunque la app esté cerrada, prepara Web Push una sola
vez por proyecto:

1. Aplica la migración
   `supabase/migrations/20261126160000_order_push_subscriptions.sql`.
2. Genera un par de claves VAPID con `npx web-push generate-vapid-keys` y un
   secreto aleatorio para el webhook. Conserva la clave privada y el secreto
   solo en el entorno seguro de Supabase.
3. Configura los secretos y publica la función:

   ```sh
   supabase secrets set VAPID_PUBLIC_KEY=CLAVE_PUBLICA VAPID_PRIVATE_KEY=CLAVE_PRIVADA VAPID_SUBJECT=mailto:soporte@tu-dominio.com ORDER_PUSH_WEBHOOK_SECRET=SECRETO_ALEATORIO
   supabase functions deploy send-order-push --no-verify-jwt
   ```

4. Configura `VITE_VAPID_PUBLIC_KEY` con la clave pública en el `.env` local y
   en las variables de entorno del hosting; reconstruye y publica el frontend.
   Esta clave es pública. Nunca pongas `VAPID_PRIVATE_KEY` ni
   `ORDER_PUSH_WEBHOOK_SECRET` en el frontend.
5. En Supabase, crea un Database Webhook para `public.orders`, evento `INSERT`,
   con URL `https://TU_PROYECTO.supabase.co/functions/v1/send-order-push` y el
   header personalizado `x-gloto-order-push-secret` con el mismo secreto
   configurado arriba.

La persona activa los avisos desde Gloto en un navegador compatible y con
conexión HTTPS. Los canales se configuran en **POS > Configuración >
Notificaciones push**: los pedidos de marketplace respetan
`notify_marketplace_orders`, y los del POS respetan `notify_pos_orders`
(desactivado por defecto). **Pop pup** solo configura el botón flotante, su color
y el sonido dentro de Gloto. Las reservas y otros canales no generan push. Al
tocar el aviso se abre la orden correspondiente. Los permisos
del navegador y del sistema operativo siguen siendo necesarios; en iOS se debe
instalar la app web para recibir push.

Para probarlo, inicia sesión en Gloto desde un dispositivo compatible y activa
el push. Crea un pedido de marketplace con `notify_marketplace_orders` activo y
verifica que llegue con Gloto cerrada; al tocarlo debe abrirse ese pedido. Los
pedidos del POS solo deben llegar cuando `notify_pos_orders` esté activo.

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
