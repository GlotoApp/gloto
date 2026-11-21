create table if not exists public.courier_identities (
  courier_user_id uuid primary key references auth.users(id) on delete cascade,
  cedula text not null unique check (cedula ~ '^[0-9]{5,15}$'),
  created_at timestamptz not null default now()
);

alter table public.courier_identities enable row level security;
revoke all on public.courier_identities from public, anon, authenticated;
grant select, insert, update, delete on public.courier_identities to service_role;

alter table public.public_courier_application_requests
  add column if not exists cedula text;

alter table public.public_courier_application_requests
  drop constraint if exists public_courier_application_requests_cedula_check;
alter table public.public_courier_application_requests
  add constraint public_courier_application_requests_cedula_check
  check (cedula is null or cedula ~ '^[0-9]{5,15}$');

create unique index if not exists public_courier_application_requests_active_cedula_uidx
  on public.public_courier_application_requests (cedula)
  where cedula is not null and status in ('pending', 'approved');

alter table public.business_courier_details
  add column if not exists cedula text;

alter table public.business_courier_details
  drop constraint if exists business_courier_details_cedula_check;
alter table public.business_courier_details
  add constraint business_courier_details_cedula_check
  check (cedula is null or cedula ~ '^[0-9]{5,15}$');

create unique index if not exists business_courier_details_cedula_uidx
  on public.business_courier_details (cedula)
  where cedula is not null;

create unique index if not exists employees_one_store_per_courier_uidx
  on public.employees (auth_user_id)
  where auth_user_id is not null
    and lower(trim(coalesce(area, ''))) like '%domiciliario%';

create or replace function public.get_my_courier_cedula()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identity.cedula
  from public.courier_identities as identity
  where identity.courier_user_id = auth.uid()
$$;

revoke all on function public.get_my_courier_cedula()
  from public, anon, authenticated;
grant execute on function public.get_my_courier_cedula()
  to authenticated;

create or replace function public.set_my_courier_cedula(p_cedula text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cedula text := regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g');
  v_existing_cedula text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para actualizar tu cédula.';
  end if;

  if p_cedula !~ '^[0-9 .-]+$' or v_cedula !~ '^[0-9]{5,15}$' then
    raise exception 'La cédula debe tener entre 5 y 15 dígitos.';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
      and profile.business_id is null
  ) then
    raise exception 'Solo un domiciliario público puede registrar su cédula.';
  end if;

  select identity.cedula
  into v_existing_cedula
  from public.courier_identities as identity
  where identity.courier_user_id = auth.uid();

  if found then
    if v_existing_cedula <> v_cedula then
      raise exception 'La cédula de esta cuenta ya está registrada y no se puede cambiar.';
    end if;
    return v_existing_cedula;
  end if;

  if exists (
    select 1
    from public.courier_identities as identity
    where identity.cedula = v_cedula
  ) then
    raise exception 'No se pudo guardar la cédula. Verifica los datos o contacta a soporte.';
  end if;

  insert into public.courier_identities (courier_user_id, cedula)
  values (auth.uid(), v_cedula);

  return v_cedula;
end;
$$;

revoke all on function public.set_my_courier_cedula(text)
  from public, anon, authenticated;
grant execute on function public.set_my_courier_cedula(text)
  to authenticated;

drop function if exists public.submit_public_courier_application_request(
  text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.submit_public_courier_application_request(
  p_full_name text,
  p_cedula text,
  p_email text,
  p_phone text,
  p_vehicle_type text,
  p_license_front_path text,
  p_license_back_path text,
  p_vehicle_card_front_path text,
  p_vehicle_card_back_path text,
  p_identity_front_path text,
  p_identity_back_path text,
  p_profile_photo_path text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_cedula text;
begin
  v_cedula := regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g');
  if p_cedula !~ '^[0-9 .-]+$' or v_cedula !~ '^[0-9]{5,15}$' then
    raise exception 'La cédula debe tener entre 5 y 15 dígitos.';
  end if;

  if lower(trim(p_vehicle_type)) not in ('car', 'motorcycle') then
    raise exception 'El tipo de vehículo no es válido.';
  end if;

  if exists (
    select 1
    from public.courier_identities as identity
    where identity.cedula = v_cedula
  ) then
    raise exception 'No se pudo registrar la solicitud. Verifica los datos o contacta a soporte.';
  end if;

  begin
    insert into public.public_courier_application_requests (
      user_id,
      full_name,
      cedula,
      email,
      phone,
      vehicle_type,
      license_front_path,
      license_back_path,
      vehicle_card_front_path,
      vehicle_card_back_path,
      identity_front_path,
      identity_back_path,
      profile_photo_path
    )
    values (
      auth.uid(),
      btrim(p_full_name),
      v_cedula,
      lower(btrim(p_email)),
      btrim(p_phone),
      lower(trim(p_vehicle_type)),
      p_license_front_path,
      p_license_back_path,
      p_vehicle_card_front_path,
      p_vehicle_card_back_path,
      p_identity_front_path,
      p_identity_back_path,
      p_profile_photo_path
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'No se pudo registrar la solicitud. Verifica los datos o contacta a soporte.';
  end;

  return v_id;
end;
$$;

revoke all on function public.submit_public_courier_application_request(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.submit_public_courier_application_request(
  text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

create or replace function public.link_public_courier_by_cedula(
  p_business_id uuid,
  p_cedula text,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cedula text;
  v_user_id uuid;
  v_full_name text;
  v_email text;
  v_phone text;
  v_already_linked boolean := false;
  v_existing_employee public.employees%rowtype;
  v_employee public.employees%rowtype;
begin
  v_cedula := regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g');
  if p_cedula !~ '^[0-9 .-]+$' or v_cedula !~ '^[0-9]{5,15}$' then
    raise exception 'La cédula debe tener entre 5 y 15 dígitos.';
  end if;

  select
    identity.courier_user_id,
    coalesce(
      nullif(trim(profile.full_name), ''),
      (
        select application.full_name
        from public.public_courier_application_requests as application
        where application.user_id = identity.courier_user_id
          and application.status = 'approved'
        order by application.created_at desc
        limit 1
      ),
      (
        select application.full_name
        from public.public_courier_applications as application
        where application.user_id = identity.courier_user_id
          and application.status = 'approved'
        order by application.created_at desc
        limit 1
      )
    ),
    profile.email,
    coalesce(
      (
        select nullif(trim(application.phone), '')
        from public.public_courier_applications as application
        where application.user_id = identity.courier_user_id
          and application.status = 'approved'
        order by application.created_at desc
        limit 1
      ),
      (
        select nullif(trim(application.phone), '')
        from public.public_courier_application_requests as application
        where application.user_id = identity.courier_user_id
          and application.status = 'approved'
        order by application.created_at desc
        limit 1
      )
    )
  into v_user_id, v_full_name, v_email, v_phone
  from public.courier_identities as identity
  join public.profiles as profile
    on profile.id = identity.courier_user_id
  where identity.cedula = v_cedula
    and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
    and profile.business_id is null
    and exists (
      select 1
      from public.public_courier_application_requests as application
      where application.user_id = identity.courier_user_id
        and application.status = 'approved'
      union all
      select 1
      from public.public_courier_applications as application
      where application.user_id = identity.courier_user_id
        and application.status = 'approved'
    )
  for update of identity;

  if not found then
    raise exception 'No encontramos una cuenta pública aprobada con esa cédula. Si ya tiene cuenta, debe registrarla primero en Mi perfil.';
  end if;

  if nullif(trim(v_full_name), '') is null then
    raise exception 'La cuenta del domiciliario no tiene un nombre completo registrado.';
  end if;

  if p_employee_id is not null then
    select *
    into v_existing_employee
    from public.employees as employee
    where employee.id = p_employee_id
      and employee.business_id = p_business_id
      and lower(trim(coalesce(employee.area, ''))) like '%domiciliario%'
    for update;

    if not found then
      raise exception 'El empleado no pertenece a esta tienda o no es domiciliario.';
    end if;

    if v_existing_employee.auth_user_id is not null
       and v_existing_employee.auth_user_id <> v_user_id then
      raise exception 'Este domiciliario ya tiene otra cuenta vinculada.';
    end if;

    v_already_linked := v_existing_employee.auth_user_id is not distinct from v_user_id;
    update public.employees as employee
    set
      name = trim(v_full_name),
      auth_user_id = v_user_id,
      store_orders_enabled = true,
      store_order_priority_enabled = true
    where employee.id = p_employee_id
    returning * into v_employee;
  else
    select *
    into v_existing_employee
    from public.employees as employee
    where employee.auth_user_id = v_user_id
      and lower(trim(coalesce(employee.area, ''))) like '%domiciliario%'
    limit 1
    for update;

    if found then
      if v_existing_employee.business_id is distinct from p_business_id then
        raise exception 'Este domiciliario ya está vinculado a otra tienda.';
      end if;
      v_employee := v_existing_employee;
      v_already_linked := true;
    else
      insert into public.employees (
        id,
        business_id,
        name,
        area,
        auth_user_id,
        store_orders_enabled,
        store_order_priority_enabled,
        permissions
      )
      values (
        gen_random_uuid(),
        p_business_id,
        trim(v_full_name),
        'Domiciliario',
        v_user_id,
        true,
        true,
        '{}'::jsonb
      )
      returning * into v_employee;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_employee.id,
    'name', v_employee.name,
    'area', v_employee.area,
    'auth_user_id', v_employee.auth_user_id,
    'email', v_email,
    'phone', coalesce(
      (
        select nullif(trim(details.phone), '')
        from public.business_courier_details as details
        where details.employee_id = v_employee.id
      ),
      v_phone
    ),
    'store_orders_enabled', v_employee.store_orders_enabled,
    'store_order_priority_enabled', v_employee.store_order_priority_enabled,
    'cedula', v_cedula,
    'already_linked', v_already_linked
  );
end;
$$;

revoke all on function public.link_public_courier_by_cedula(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.link_public_courier_by_cedula(uuid, text, uuid)
  to service_role;

create or replace function public.unlink_my_domiciliario_from_store()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_employee_id uuid;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para desvincularte de una tienda.';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
      and profile.business_id is null
  ) then
    raise exception 'Solo un domiciliario puede desvincularse de una tienda.';
  end if;

  select employee.id
  into v_employee_id
  from public.employees as employee
  where employee.auth_user_id = v_user_id
    and lower(trim(coalesce(employee.area, ''))) like '%domiciliario%'
  limit 1
  for update;

  if v_employee_id is null then
    raise exception 'No tienes una tienda vinculada.';
  end if;

  if exists (
    select 1
    from public.orders as order_row
    where coalesce(order_row.public_courier_id, order_row.delivery_courier_id) = v_user_id
      and lower(trim(coalesce(order_row.delivery_status, ''))) in ('assigned', 'picked_up')
  ) then
    raise exception 'Completa tu entrega en curso antes de desvincularte.';
  end if;

  update public.employees as employee
  set
    auth_user_id = null,
    delivery_available = false,
    store_orders_enabled = false,
    store_order_priority_enabled = false
  where employee.id = v_employee_id
    and employee.auth_user_id = v_user_id;

  if not found then
    raise exception 'No se pudo completar la desvinculación. Intenta de nuevo.';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.unlink_my_domiciliario_from_store()
  from public, anon, authenticated;
grant execute on function public.unlink_my_domiciliario_from_store()
  to authenticated;
