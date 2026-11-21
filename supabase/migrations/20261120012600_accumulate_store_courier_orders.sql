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
  v_store_order_priority_enabled boolean;
begin
  select
    employee.business_id,
    employee.store_orders_enabled and employee.delivery_available,
    employee.store_order_priority_enabled
  into
    v_business_id,
    v_is_online,
    v_store_order_priority_enabled
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
        and (
          coalesce(v_store_order_priority_enabled, false)
          or exists (
            select 1
            from public.courier_order_dispatches as dispatch
            where dispatch.order_id = order_row.id
              and dispatch.phase = 'store'
              and (
                current_setting('gloto.courier_dispatch_internal', true) = 'on'
                or (
                  dispatch.assigned_courier_id = auth.uid()
                  and dispatch.offer_expires_at > now()
                )
              )
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
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_is_online boolean;
  v_store_order_priority_enabled boolean;
  v_order_id uuid;
begin
  if v_user_id is null then
    raise exception 'Inicia sesión para aceptar un domicilio.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select
    employee.business_id,
    employee.store_orders_enabled and employee.delivery_available,
    employee.store_order_priority_enabled
  into
    v_business_id,
    v_is_online,
    v_store_order_priority_enabled
  from public.employees as employee
  join public.profiles as profile on profile.id = employee.auth_user_id
  where employee.auth_user_id = v_user_id
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
    where active_order.public_courier_id = v_user_id
      and lower(trim(coalesce(active_order.delivery_status, ''))) in ('assigned', 'picked_up')
  ) then
    raise exception 'Completa tu entrega pública antes de aceptar pedidos de tienda.';
  end if;
  if not coalesce(v_store_order_priority_enabled, false) and exists (
    select 1
    from public.orders as active_order
    where active_order.delivery_courier_id = v_user_id
      and lower(trim(coalesce(active_order.delivery_status, ''))) in ('assigned', 'picked_up')
  ) then
    raise exception 'Completa tu entrega actual antes de aceptar otra oferta.';
  end if;

  update public.orders as order_row
  set delivery_courier_id = v_user_id,
      delivery_status = 'assigned',
      updated_at = now()
  where order_row.id = p_order_id
    and order_row.business_id = v_business_id
    and coalesce(order_row.is_reservation, false) = false
    and lower(trim(coalesce(order_row.order_type, ''))) in ('delivery', 'domicilio')
    and lower(trim(coalesce(order_row.status, ''))) = 'dispatched'
    and order_row.delivery_status = 'available'
    and order_row.delivery_courier_id is null
    and (
      coalesce(v_store_order_priority_enabled, false)
      or exists (
        select 1
        from public.courier_order_dispatches as dispatch
        where dispatch.order_id = order_row.id
          and dispatch.phase = 'store'
          and dispatch.assigned_courier_id = v_user_id
          and dispatch.offer_expires_at > now()
      )
    )
  returning order_row.id into v_order_id;

  if v_order_id is null then
    raise exception 'El domicilio ya no está disponible.';
  end if;
end;
$function$;

revoke all on function public.claim_domiciliario_order(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_domiciliario_order(uuid)
  to authenticated;
