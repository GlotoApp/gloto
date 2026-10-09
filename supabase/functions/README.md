# Edge Functions

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
```

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
