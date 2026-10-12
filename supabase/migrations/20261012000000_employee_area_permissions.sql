create table if not exists public.business_employee_areas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create unique index if not exists business_employee_areas_business_name_key
  on public.business_employee_areas (business_id, lower(name));

alter table public.employees
  add column if not exists area_id uuid
  references public.business_employee_areas(id) on delete set null,
  add column if not exists permissions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permissions) = 'object');

with employee_areas as (
  select
    e.business_id,
    lower(btrim(e.area)) as normalized_name,
    min(btrim(e.area)) as name
  from public.employees e
  where e.business_id is not null
    and nullif(btrim(e.area), '') is not null
  group by e.business_id, lower(btrim(e.area))
)
insert into public.business_employee_areas (business_id, name)
select employee_areas.business_id, employee_areas.name
from employee_areas
where not exists (
    select 1
    from public.business_employee_areas a
    where a.business_id = employee_areas.business_id
      and lower(a.name) = employee_areas.normalized_name
  );

update public.employees e
set area_id = a.id
from public.business_employee_areas a
where e.business_id = a.business_id
  and lower(btrim(e.area)) = lower(a.name)
  and e.area_id is null;

alter table public.business_employee_areas enable row level security;

drop policy if exists business_employee_areas_owner_all
  on public.business_employee_areas;
create policy business_employee_areas_owner_all
  on public.business_employee_areas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id = business_employee_areas.business_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id = business_employee_areas.business_id
    )
  );
grant select, insert, update, delete
  on public.business_employee_areas
  to authenticated;

create or replace function public.get_my_employee_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'employee_id', e.id,
    'business_id', e.business_id,
    'area_id', e.area_id,
    'permissions', coalesce(e.permissions, '{}'::jsonb)
  )
  from public.employees e
  join public.profiles p on p.id = auth.uid()
  left join public.business_employee_areas a
    on a.id = e.area_id
   and a.business_id = e.business_id
  where e.auth_user_id = auth.uid()
    and p.role in ('empleado', 'employee')
    and p.business_id = e.business_id
    and a.id is not null
  limit 1;
$$;

revoke all on function public.get_my_employee_access() from public;
grant execute on function public.get_my_employee_access() to authenticated;

create or replace function public.has_current_employee_permission(
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
    or exists (
      select 1
      from public.employees e
      join public.profiles p on p.id = e.auth_user_id
      join public.business_employee_areas a
        on a.id = e.area_id
       and a.business_id = e.business_id
      where e.auth_user_id = auth.uid()
        and p.role in ('empleado', 'employee')
        and p.business_id = e.business_id
        and e.permissions -> p_permission = 'true'::jsonb
    );
$$;

revoke all on function public.has_current_employee_permission(text) from public;
grant execute on function public.has_current_employee_permission(text)
  to authenticated;

do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'cash_register_movements',
    'cash_register_shifts',
    'cash_register_shift_orders'
  ]
  loop
    if to_regclass(format('public.%I', protected_table)) is not null then
      execute format(
        'drop policy if exists employee_cash_access on public.%I',
        protected_table
      );
      execute format(
        'create policy employee_cash_access on public.%I as restrictive for all to authenticated using (public.has_current_employee_permission(%L)) with check (public.has_current_employee_permission(%L))',
        protected_table,
        'caja',
        'caja'
      );
    end if;
  end loop;

  if to_regclass('public.business_notifications') is not null then
    execute 'drop policy if exists employee_notifications_access on public.business_notifications';
    execute
      'create policy employee_notifications_access on public.business_notifications as restrictive for all to authenticated using (public.has_current_employee_permission(''notificaciones'')) with check (public.has_current_employee_permission(''notificaciones''))';
  end if;
end;
$$;

do $$
declare
  function_signature text;
  function_found boolean := false;
begin
  for function_signature in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_statistics_dashboard'
  loop
    function_found := true;
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      function_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      function_signature
    );
  end loop;

  if not function_found then
    raise exception 'No se encontró public.get_statistics_dashboard para proteger su acceso.';
  end if;
end;
$$;

do $$
declare
  target_function record;
begin
  select
    format_type(p.proargtypes[0], null) as start_type,
    format_type(p.proargtypes[1], null) as end_type,
    format_type(p.proargtypes[2], null) as business_type
  into target_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_statistics_dashboard'
    and p.pronargs = 3
    and p.proargtypes[0] = 'date'::regtype
    and p.proargtypes[1] = 'date'::regtype
    and p.proargtypes[2] = 'uuid'::regtype
  limit 1;

  if target_function.start_type is null
    or target_function.end_type is null
    or target_function.business_type is null then
    raise exception 'No se encontró public.get_statistics_dashboard con tres parámetros.';
  end if;

  execute format($ddl$
    create or replace function public.get_statistics_dashboard_for_employee(
      p_user_id uuid,
      p_start_date date,
      p_end_date date
    )
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
    as $function$
    declare
      dashboard jsonb;
      business_id uuid;
    begin
      select p.business_id
      into business_id
      from public.profiles p
      where p.id = p_user_id;

      if business_id is null then
        raise exception 'No se encontró el negocio del usuario.';
      end if;

      perform set_config('request.jwt.claim.sub', p_user_id::text, true);
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
        true
      );
      execute 'select public.get_statistics_dashboard($1::%s, $2::%s, $3::%s)'
        into dashboard
        using p_start_date, p_end_date, business_id;
      return dashboard;
    end;
    $function$;
  $ddl$,
    target_function.start_type,
    target_function.end_type,
    target_function.business_type
  );
end;
$$;

revoke all on function public.get_statistics_dashboard_for_employee(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.get_statistics_dashboard_for_employee(uuid, date, date)
  to service_role;
