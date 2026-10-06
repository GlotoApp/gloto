# Edge Functions

## Crear cuenta de negocio

La función `crear-cuenta-negocio` solo permite solicitudes de una sesión válida
cuyo perfil en `public.profiles` tenga el rol `superadmin`. Usa las variables
administrativas proporcionadas por Supabase en el entorno de Edge Functions;
ninguna clave de servicio debe configurarse en el frontend.

Para desplegarla desde este repositorio:

```sh
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy crear-cuenta-negocio
```

Luego abre `/superadmin/cuentas/nueva`. El formulario solicita la categoría,
el WhatsApp y, opcionalmente, la dirección, además de los datos de acceso. La
función crea el negocio, su información inicial, una cuenta confirmada en Auth
y su perfil con rol `admin`; si falla un paso, intenta revertir los registros
creados.

La función `eliminar-cuenta-negocio` también exige una sesión válida de
superadmin. Elimina permanentemente el negocio y sus datos relacionados, los
archivos almacenados bajo el identificador del negocio y los usuarios
vinculados. La pantalla pide escribir el slug de la tienda antes de confirmar.
Antes de habilitar la eliminación, ejecuta
`supabase/113_auth_user_review_references_set_null.sql` en el SQL Editor de
Supabase. Esto conserva los registros financieros y de cambios de plan, pero
quita la referencia al usuario eliminado en su campo `reviewed_by`. Después,
despliega:

```sh
supabase functions deploy eliminar-cuenta-negocio
```
