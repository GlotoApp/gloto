alter table public.profiles
  add column if not exists full_name text;

update public.profiles AS profile
set full_name = coalesce(
  nullif(trim(employee.name), ''),
  nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
  nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
)
from auth.users AS auth_user
left join lateral (
  select employee_row.name
  from public.employees AS employee_row
  where employee_row.auth_user_id = auth_user.id
    and lower(trim(coalesce(employee_row.area, ''))) like '%domiciliario%'
  order by employee_row.created_at desc
  limit 1
) AS employee on true
where profile.id = auth_user.id
  and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
  and nullif(trim(profile.full_name), '') is null
  and coalesce(
    nullif(trim(employee.name), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
  ) is not null;

create or replace function public.get_my_courier_profile_name()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text;
begin
  select profile.full_name
  into v_full_name
  from public.profiles AS profile
  where profile.id = auth.uid()
    and lower(trim(coalesce(profile.role, ''))) = 'domiciliario';

  if not found then
    raise exception 'No se encontró el perfil del domiciliario.';
  end if;

  return v_full_name;
end;
$function$;

create or replace function public.set_my_courier_profile_name(p_full_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text := trim(coalesce(p_full_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para actualizar tu nombre.';
  end if;
  if char_length(v_full_name) < 3 or char_length(v_full_name) > 120 then
    raise exception 'El nombre debe tener entre 3 y 120 caracteres.';
  end if;

  update public.profiles AS profile
  set full_name = v_full_name
  where profile.id = auth.uid()
    and lower(trim(coalesce(profile.role, ''))) = 'domiciliario';

  if not found then
    raise exception 'No se encontró el perfil del domiciliario.';
  end if;

  update auth.users AS auth_user
  set raw_user_meta_data =
    coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', v_full_name)
  where auth_user.id = auth.uid();

  return v_full_name;
end;
$function$;

revoke all on function public.get_my_courier_profile_name() from public;
revoke all on function public.set_my_courier_profile_name(text) from public;
grant execute on function public.get_my_courier_profile_name() to authenticated;
grant execute on function public.set_my_courier_profile_name(text) to authenticated;
