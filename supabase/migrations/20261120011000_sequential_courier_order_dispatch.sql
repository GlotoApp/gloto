create table if not exists public.courier_order_dispatches (
  order_id uuid primary key references public.orders(id) on delete cascade,
  phase text not null check (phase in ('store', 'public', 'claimed', 'closed')),
  dispatch_started_at timestamptz not null,
  store_expires_at timestamptz not null,
  assigned_courier_id uuid references auth.users(id) on delete set null,
  offer_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists courier_order_dispatches_waiting_idx
  on public.courier_order_dispatches (phase, dispatch_started_at, order_id)
  where assigned_courier_id is null;

create unique index if not exists courier_order_dispatches_one_offer_per_courier_idx
  on public.courier_order_dispatches (assigned_courier_id)
  where assigned_courier_id is not null
    and phase in ('store', 'public');

create table if not exists public.courier_order_dispatch_attempts (
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null check (
    outcome in ('declined', 'expired', 'inactive', 'store_timeout')
  ),
  primary key (order_id, courier_id)
);

alter table public.courier_order_dispatches enable row level security;
alter table public.courier_order_dispatch_attempts enable row level security;
revoke all on public.courier_order_dispatches from public, anon, authenticated;
revoke all on public.courier_order_dispatch_attempts from public, anon, authenticated;

create or replace function public.sync_courier_order_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_order_status text := lower(trim(coalesce(new.status, '')));
  v_delivery_status text := lower(trim(coalesce(new.delivery_status, '')));
begin
  if coalesce(new.is_reservation, false)
    or lower(trim(coalesce(new.order_type, ''))) not in ('delivery', 'domicilio') then
    update public.courier_order_dispatches
    set phase = 'closed',
        assigned_courier_id = null,
        offer_expires_at = null,
        updated_at = now()
    where order_id = new.id
      and phase in ('store', 'public');
    return new;
  end if;

  if v_delivery_status in (
      'delivered', 'entregado', 'completado', 'complete', 'completed',
      'cancelled', 'canceled', 'cancelado'
    )
    or v_order_status in (
      'delivered', 'entregado', 'completado', 'complete', 'completed',
      'cancelled', 'canceled', 'cancelado', 'cancelled_by_customer'
    ) then
    update public.courier_order_dispatches
    set phase = 'closed',
        assigned_courier_id = null,
        offer_expires_at = null,
        updated_at = now()
    where order_id = new.id;
    return new;
  end if;

  if v_delivery_status in ('assigned', 'picked_up')
    or new.delivery_courier_id is not null
    or new.public_courier_id is not null then
    update public.courier_order_dispatches
    set phase = 'claimed',
        assigned_courier_id = coalesce(new.public_courier_id, new.delivery_courier_id),
        offer_expires_at = null,
        updated_at = now()
    where order_id = new.id;
    return new;
  end if;

  if v_order_status = 'dispatched' and v_delivery_status = 'available' then
    insert into public.courier_order_dispatches (
      order_id,
      phase,
      dispatch_started_at,
      store_expires_at
    )
    values (
      new.id,
      'store',
      now(),
      now() + interval '10 seconds'
    )
    on conflict (order_id) do nothing;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_courier_order_dispatch()
  from public, anon, authenticated;

drop trigger if exists orders_sync_courier_order_dispatch
  on public.orders;
create trigger orders_sync_courier_order_dispatch
after insert or update of
  status,
  delivery_status,
  delivery_courier_id,
  public_courier_id,
  is_reservation,
  order_type
on public.orders
for each row
execute function public.sync_courier_order_dispatch();

insert into public.courier_order_dispatches (
  order_id,
  phase,
  dispatch_started_at,
  store_expires_at
)
select
  order_row.id,
  'public',
  now(),
  now()
from public.orders as order_row
where coalesce(order_row.is_reservation, false) = false
  and lower(trim(coalesce(order_row.order_type, ''))) in ('delivery', 'domicilio')
  and lower(trim(coalesce(order_row.status, ''))) = 'dispatched'
  and lower(trim(coalesce(order_row.delivery_status, ''))) = 'available'
  and order_row.delivery_courier_id is null
  and order_row.public_courier_id is null
on conflict (order_id) do nothing;

create or replace function public.get_domiciliario_orders()
returns table(
  order_id uuid,
  created_at timestamp with time zone,
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_instructions text,
  linkmaps text,
  delivery_fee numeric,
  delivery_status text,
  business_name text,
  destination_latitude numeric,
  destination_longitude numeric,
  business_id uuid,
  business_logo_url text,
  payment_method text,
  pickup_address text,
  pickup_latitude numeric,
  pickup_longitude numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business_id uuid;
  v_is_online boolean;
begin
  select
    employee.business_id,
    employee.store_orders_enabled and employee.delivery_available
  into v_business_id, v_is_online
  from public.employees as employee
  join public.profiles as profile on profile.id = employee.auth_user_id
  where employee.auth_user_id = auth.uid()
    and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
    and lower(trim(coalesce(employee.area, ''))) like '%domiciliario%'
  order by employee.created_at desc
  limit 1;

  if v_business_id is null then
    raise exception 'La cuenta no está vinculada a un negocio como domiciliario.';
  end if;

  return query
  select
    order_row.id,
    order_row.created_at,
    order_row.customer_name::text,
    order_row.customer_phone::text,
    order_row.delivery_address::text,
    coalesce(order_row.delivery_instructions, '')::text,
    coalesce(order_row.linkmaps, '')::text,
    coalesce(order_row.delivery_fee, 0)::numeric,
    order_row.delivery_status,
    business.name::text,
    nullif(order_row.metadata #>> '{delivery_location,latitude}', '')::numeric,
    nullif(order_row.metadata #>> '{delivery_location,longitude}', '')::numeric,
    business.id,
    business.logo_url::text,
    case when order_row.delivery_courier_id = auth.uid()
      then order_row.payment_method::text else null::text end,
    case when order_row.delivery_courier_id = auth.uid()
      then info.address::text else null::text end,
    case when order_row.delivery_courier_id = auth.uid()
      then info.latitude else null::numeric end,
    case when order_row.delivery_courier_id = auth.uid()
      then info.longitude else null::numeric end
  from public.orders as order_row
  join public.businesses as business on business.id = order_row.business_id
  left join public.business_info as info on info.business_id = business.id
  where order_row.business_id = v_business_id
    and coalesce(order_row.is_reservation, false) = false
    and lower(trim(coalesce(order_row.order_type, ''))) in ('delivery', 'domicilio')
    and lower(trim(coalesce(order_row.status, ''))) not in (
      'delivered', 'entregado', 'completado', 'complete', 'completed',
      'cancelled', 'canceled', 'cancelado', 'cancelled_by_customer'
    )
    and (
      (
        coalesce(v_is_online, false)
        and order_row.delivery_status = 'available'
        and lower(trim(coalesce(order_row.status, ''))) = 'dispatched'
        and exists (
          select 1
          from public.courier_order_dispatches as dispatch
          where dispatch.order_id = order_row.id
            and dispatch.phase = 'store'
            and (
              current_setting('gloto.courier_dispatch_internal', true) = 'on'
              or dispatch.assigned_courier_id = auth.uid()
            )
        )
      )
      or order_row.delivery_courier_id = auth.uid()
    )
  order by order_row.created_at desc;
end;
$function$;

create or replace function public.claim_domiciliario_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business_id uuid;
  v_is_online boolean;
  v_order_id uuid;
begin
  select
    employee.business_id,
    employee.store_orders_enabled and employee.delivery_available
  into v_business_id, v_is_online
  from public.employees as employee
  join public.profiles as profile on profile.id = employee.auth_user_id
  where employee.auth_user_id = auth.uid()
    and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
    and lower(trim(coalesce(employee.area, ''))) like '%domiciliario%'
  order by employee.created_at desc
  limit 1;

  if v_business_id is null then
    raise exception 'La cuenta no está vinculada a un negocio como domiciliario.';
  end if;
  if not coalesce(v_is_online, false) then
    raise exception 'No puedes tomar nuevos pedidos de esta tienda en este momento.';
  end if;
  if exists (
    select 1
    from public.orders as active_order
    where coalesce(active_order.public_courier_id, active_order.delivery_courier_id) = auth.uid()
      and lower(trim(coalesce(active_order.delivery_status, ''))) in ('assigned', 'picked_up')
  ) then
    raise exception 'Completa tu entrega actual antes de aceptar otra oferta.';
  end if;

  update public.orders as order_row
  set delivery_courier_id = auth.uid(),
      delivery_status = 'assigned',
      updated_at = now()
  where order_row.id = p_order_id
    and order_row.business_id = v_business_id
    and coalesce(order_row.is_reservation, false) = false
    and lower(trim(coalesce(order_row.order_type, ''))) in ('delivery', 'domicilio')
    and lower(trim(coalesce(order_row.status, ''))) = 'dispatched'
    and order_row.delivery_status = 'available'
    and order_row.delivery_courier_id is null
    and exists (
      select 1
      from public.courier_order_dispatches as dispatch
      where dispatch.order_id = order_row.id
        and dispatch.phase = 'store'
        and dispatch.assigned_courier_id = auth.uid()
        and dispatch.offer_expires_at > now()
    )
  returning order_row.id into v_order_id;

  if v_order_id is null then
    raise exception 'El domicilio ya no está disponible.';
  end if;
end;
$function$;

create or replace function public.get_my_courier_order_offer()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_dispatch public.courier_order_dispatches%rowtype;
  v_order_id uuid;
  v_order jsonb;
  v_offer_expires_at timestamptz;
  v_store_courier_online boolean;
  v_public_courier_approved boolean;
begin
  if v_user_id is null then
    raise exception 'Inicia sesión para recibir ofertas.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  perform set_config('gloto.courier_dispatch_internal', 'on', true);

  insert into public.courier_order_dispatch_attempts (
    order_id, courier_id, attempted_at, outcome
  )
  select order_id, assigned_courier_id, now(), 'store_timeout'
  from public.courier_order_dispatches
  where phase = 'store'
    and assigned_courier_id is not null
    and store_expires_at <= now()
  on conflict (order_id, courier_id) do update
  set attempted_at = excluded.attempted_at,
      outcome = excluded.outcome;

  update public.courier_order_dispatches
  set phase = 'public',
      assigned_courier_id = null,
      offer_expires_at = null,
      updated_at = now()
  where phase = 'store'
    and store_expires_at <= now();

  insert into public.courier_order_dispatch_attempts (
    order_id, courier_id, attempted_at, outcome
  )
  select order_id, assigned_courier_id, now(), 'expired'
  from public.courier_order_dispatches
  where phase = 'public'
    and assigned_courier_id is not null
    and offer_expires_at <= now()
  on conflict (order_id, courier_id) do update
  set attempted_at = excluded.attempted_at,
      outcome = excluded.outcome;

  update public.courier_order_dispatches
  set phase = 'store',
      assigned_courier_id = null,
      store_expires_at = now() + interval '10 seconds',
      offer_expires_at = null,
      updated_at = now()
  where phase = 'public'
    and assigned_courier_id is not null
    and offer_expires_at <= now();

  update public.courier_order_dispatches as dispatch
  set phase = case
        when lower(trim(coalesce(order_row.delivery_status, ''))) in ('assigned', 'picked_up')
          then 'claimed'
        when lower(trim(coalesce(order_row.delivery_status, ''))) in (
          'delivered', 'entregado', 'completado', 'complete', 'completed',
          'cancelled', 'canceled', 'cancelado', 'cancelled_by_customer'
        ) or lower(trim(coalesce(order_row.status, ''))) in (
          'delivered', 'entregado', 'completado', 'complete', 'completed',
          'cancelled', 'canceled', 'cancelado', 'cancelled_by_customer'
        ) then 'closed'
        else 'closed'
      end,
      assigned_courier_id = case
        when lower(trim(coalesce(order_row.delivery_status, ''))) in ('assigned', 'picked_up')
          then coalesce(order_row.public_courier_id, order_row.delivery_courier_id)
        else null
      end,
      offer_expires_at = null,
      updated_at = now()
  from public.orders as order_row
  where order_row.id = dispatch.order_id
    and dispatch.phase in ('store', 'public')
    and (
      lower(trim(coalesce(order_row.delivery_status, ''))) <> 'available'
      or lower(trim(coalesce(order_row.status, ''))) <> 'dispatched'
    );

  if exists (
    select 1
    from public.orders as order_row
    where coalesce(order_row.public_courier_id, order_row.delivery_courier_id) = v_user_id
      and lower(trim(coalesce(order_row.delivery_status, ''))) in ('assigned', 'picked_up')
  ) then
    insert into public.courier_order_dispatch_attempts (
      order_id, courier_id, attempted_at, outcome
    )
    select order_id, v_user_id, now(), 'inactive'
    from public.courier_order_dispatches
    where assigned_courier_id = v_user_id
      and phase = 'public'
    on conflict (order_id, courier_id) do update
    set attempted_at = excluded.attempted_at,
        outcome = excluded.outcome;

    update public.courier_order_dispatches
    set assigned_courier_id = null,
        offer_expires_at = null,
        updated_at = now()
    where assigned_courier_id = v_user_id
      and phase in ('store', 'public');

    return null;
  end if;

  select *
  into v_dispatch
  from public.courier_order_dispatches
  where assigned_courier_id = v_user_id
    and phase in ('store', 'public')
    and offer_expires_at > now()
  order by offer_expires_at, dispatch_started_at
  limit 1
  for update;

  if found then
    if v_dispatch.phase = 'store' then
      select to_jsonb(store_order)
      into v_order
      from public.get_domiciliario_orders() as store_order
      where store_order.order_id = v_dispatch.order_id
        and store_order.delivery_status = 'available';
    else
      select to_jsonb(public_order)
      into v_order
      from public.get_public_courier_map_orders() as public_order
      where public_order.order_id = v_dispatch.order_id
        and public_order.delivery_status = 'available';
    end if;

    if v_order is not null then
      return v_order || jsonb_build_object(
        'courier_mode',
        case when v_dispatch.phase = 'store' then 'private' else 'public' end,
        'courier_offer_expires_at',
        v_dispatch.offer_expires_at
      );
    end if;

    if v_dispatch.phase = 'public' then
      insert into public.courier_order_dispatch_attempts (
        order_id, courier_id, attempted_at, outcome
      )
      values (v_dispatch.order_id, v_user_id, now(), 'inactive')
      on conflict (order_id, courier_id) do update
      set attempted_at = excluded.attempted_at,
          outcome = excluded.outcome;
    end if;

    update public.courier_order_dispatches
    set assigned_courier_id = null,
        offer_expires_at = null,
        updated_at = now()
    where order_id = v_dispatch.order_id
      and assigned_courier_id = v_user_id;
  end if;

  select exists (
    select 1
    from public.employees as employee
    join public.profiles as profile on profile.id = employee.auth_user_id
    where employee.auth_user_id = v_user_id
      and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
      and lower(trim(coalesce(employee.area, ''))) like '%domiciliario%'
      and employee.store_orders_enabled = true
      and employee.delivery_available = true
  )
  into v_store_courier_online;

  if v_store_courier_online then
    select dispatch.order_id, to_jsonb(store_order), now() + interval '10 seconds'
    into v_order_id, v_order, v_offer_expires_at
    from public.courier_order_dispatches as dispatch
    join lateral public.get_domiciliario_orders() as store_order
      on store_order.order_id = dispatch.order_id
    where dispatch.phase = 'store'
      and dispatch.assigned_courier_id is null
      and dispatch.store_expires_at > now()
      and store_order.delivery_status = 'available'
    order by store_order.created_at, dispatch.order_id
    limit 1
    for update of dispatch skip locked;

    if found then
      update public.courier_order_dispatches
      set assigned_courier_id = v_user_id,
          store_expires_at = v_offer_expires_at,
          offer_expires_at = v_offer_expires_at,
          updated_at = now()
      where order_id = v_order_id;

      return v_order || jsonb_build_object(
        'courier_mode', 'private',
        'courier_offer_expires_at', v_offer_expires_at
      );
    end if;
  end if;

  select exists (
    select 1
    from public.public_courier_application_requests as application
    where application.user_id = v_user_id
      and application.status = 'approved'
  )
  into v_public_courier_approved;

  if v_public_courier_approved then
    select dispatch.order_id, to_jsonb(public_order), now() + interval '15 seconds'
    into v_order_id, v_order, v_offer_expires_at
    from public.courier_order_dispatches as dispatch
    join lateral public.get_public_courier_map_orders() as public_order
      on public_order.order_id = dispatch.order_id
    where dispatch.phase = 'public'
      and dispatch.assigned_courier_id is null
      and public_order.delivery_status = 'available'
      and not exists (
        select 1
        from public.courier_order_dispatch_attempts as attempt
        where attempt.courier_id = v_user_id
          and attempt.attempted_at > now() - interval '15 seconds'
      )
    order by public_order.created_at, dispatch.order_id
    limit 1
    for update of dispatch skip locked;

    if found then
      update public.courier_order_dispatches
      set assigned_courier_id = v_user_id,
          offer_expires_at = v_offer_expires_at,
          updated_at = now()
      where order_id = v_order_id;

      return v_order || jsonb_build_object(
        'courier_mode', 'public',
        'courier_offer_expires_at', v_offer_expires_at
      );
    end if;
  end if;

  return null;
end;
$function$;

create or replace function public.skip_my_courier_order_offer(
  p_order_id uuid,
  p_expired boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_dispatch public.courier_order_dispatches%rowtype;
begin
  if v_user_id is null then
    raise exception 'Inicia sesión para omitir una oferta.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select *
  into v_dispatch
  from public.courier_order_dispatches
  where order_id = p_order_id
    and assigned_courier_id = v_user_id
    and phase in ('store', 'public')
  for update;

  if not found then
    return;
  end if;
  if p_expired and v_dispatch.offer_expires_at > now() then
    return;
  end if;

  insert into public.courier_order_dispatch_attempts (
    order_id, courier_id, attempted_at, outcome
  )
  values (
    p_order_id,
    v_user_id,
    now(),
    case when p_expired then 'expired' else 'declined' end
  )
  on conflict (order_id, courier_id) do update
  set attempted_at = excluded.attempted_at,
      outcome = excluded.outcome;

  update public.courier_order_dispatches
  set phase = case
        when v_dispatch.phase = 'public' then 'store'
        else 'public'
      end,
      store_expires_at = case
        when v_dispatch.phase = 'public'
          then now() + interval '10 seconds'
        else store_expires_at
      end,
      assigned_courier_id = null,
      offer_expires_at = null,
      updated_at = now()
  where order_id = p_order_id;
end;
$function$;

create or replace function public.claim_my_courier_order_offer(
  p_order_id uuid,
  p_courier_mode text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_dispatch public.courier_order_dispatches%rowtype;
begin
  if v_user_id is null then
    raise exception 'Inicia sesión para aceptar una oferta.';
  end if;
  if p_courier_mode is null or p_courier_mode not in ('private', 'public') then
    raise exception 'La fuente de la oferta no es válida.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select *
  into v_dispatch
  from public.courier_order_dispatches
  where order_id = p_order_id
    and assigned_courier_id = v_user_id
    and phase = case when p_courier_mode = 'private' then 'store' else 'public' end
    and offer_expires_at > now()
  for update;

  if not found then
    raise exception 'La oferta venció o ya fue asignada a otro domiciliario.';
  end if;

  if exists (
    select 1
    from public.orders as order_row
    where coalesce(order_row.public_courier_id, order_row.delivery_courier_id) = v_user_id
      and lower(trim(coalesce(order_row.delivery_status, ''))) in ('assigned', 'picked_up')
  ) then
    raise exception 'Completa tu entrega actual antes de aceptar otra oferta.';
  end if;

  if p_courier_mode = 'private' then
    perform public.claim_domiciliario_order(p_order_id);
  else
    perform public.claim_public_courier_order(p_order_id);
  end if;

  update public.courier_order_dispatches
  set phase = 'claimed',
      assigned_courier_id = v_user_id,
      offer_expires_at = null,
      updated_at = now()
  where order_id = p_order_id;
end;
$function$;

revoke all on function public.get_my_courier_order_offer()
  from public, anon;
revoke all on function public.skip_my_courier_order_offer(uuid, boolean)
  from public, anon;
revoke all on function public.claim_my_courier_order_offer(uuid, text)
  from public, anon;
grant execute on function public.get_my_courier_order_offer()
  to authenticated;
grant execute on function public.skip_my_courier_order_offer(uuid, boolean)
  to authenticated;
grant execute on function public.claim_my_courier_order_offer(uuid, text)
  to authenticated;

do $$
declare
  function_definition text;
  updated_definition text;
  match_text text := 'order_row.delivery_status = ''available''';
  public_dispatch_guard text := $guard$
AND EXISTS (
  SELECT 1
  FROM public.courier_order_dispatches AS dispatch
  WHERE dispatch.order_id = order_row.id
    AND dispatch.phase = 'public'
    AND (
      current_setting('gloto.courier_dispatch_internal', true) = 'on'
      OR dispatch.assigned_courier_id = auth.uid()
    )
)
$guard$;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_public_courier_map_orders';

  if function_definition is null then
    raise exception 'No se encontró public.get_public_courier_map_orders.';
  end if;
  if position(public_dispatch_guard in function_definition) > 0 then
    return;
  end if;
  if position(match_text in function_definition) = 0 then
    raise exception 'No se encontró el filtro de pedidos disponibles en public.get_public_courier_map_orders.';
  end if;

  updated_definition := replace(
    function_definition,
    match_text,
    match_text || E'\n  ' || public_dispatch_guard
  );
  execute updated_definition;
end;
$$;

do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  public_priority_window text := E'\n  ' || $gate$
AND NOT EXISTS (
  SELECT 1
  FROM public.employees AS priority_employee
  WHERE priority_employee.business_id = order_row.business_id
    AND priority_employee.auth_user_id IS NOT NULL
    AND priority_employee.store_order_priority_enabled = true
    AND priority_employee.store_orders_enabled = true
    AND priority_employee.delivery_available = true
    AND priority_employee.delivery_availability_updated_at > now() - interval '2 minutes'
    AND order_row.created_at > now() - interval '10 seconds'
)
$gate$;
  public_priority_window_20_seconds text;
  public_priority_window_2_minutes text;
begin
  public_priority_window_20_seconds := replace(
    public_priority_window,
    '10 seconds',
    '20 seconds'
  );
  public_priority_window_2_minutes := replace(
    public_priority_window,
    '10 seconds',
    '2 minutes'
  );

  foreach function_name in array array[
    'get_public_courier_map_orders',
    'claim_public_courier_order'
  ]
  loop
    select pg_get_functiondef(p.oid)
    into function_definition
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = function_name;

    if function_definition is null then
      raise exception 'No se encontró public.%.', function_name;
    end if;

    updated_definition := replace(
      function_definition,
      public_priority_window,
      ''
    );
    updated_definition := replace(
      updated_definition,
      public_priority_window_20_seconds,
      ''
    );
    updated_definition := replace(
      updated_definition,
      public_priority_window_2_minutes,
      ''
    );
    if updated_definition <> function_definition then
      execute updated_definition;
    end if;
  end loop;
end;
$$;

do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  match_text text := 'order_row.delivery_status = ''available''';
  public_guard text := $guard$
AND EXISTS (
  SELECT 1
  FROM public.courier_order_dispatches AS dispatch
  WHERE dispatch.order_id = order_row.id
    AND dispatch.phase = 'public'
    AND dispatch.assigned_courier_id = auth.uid()
    AND dispatch.offer_expires_at > now()
)
$guard$;
begin
  foreach function_name in array array['claim_public_courier_order']
  loop
    select pg_get_functiondef(p.oid)
    into function_definition
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = function_name;

    if function_definition is null then
      raise exception 'No se encontró public.%.', function_name;
    end if;
    if position(public_guard in function_definition) > 0 then
      continue;
    end if;
    if position(match_text in function_definition) = 0 then
      raise exception 'No se encontró el filtro de pedido disponible en public.%.',
        function_name;
    end if;

    updated_definition := replace(
      function_definition,
      match_text,
      match_text || E'\n  ' || public_guard
    );
    execute updated_definition;
  end loop;
end;
$$;

revoke all on function public.claim_domiciliario_order(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_public_courier_order(uuid)
  from public, anon, authenticated;
