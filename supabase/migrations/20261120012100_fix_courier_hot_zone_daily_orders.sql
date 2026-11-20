create or replace function public.get_courier_hot_zones()
returns table(
  business_id uuid,
  business_name text,
  latitude numeric,
  longitude numeric,
  order_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not (
    exists (
      select 1
      from public.employees as employee
      join public.profiles as profile
        on profile.id = employee.auth_user_id
      where employee.auth_user_id = auth.uid()
        and lower(trim(coalesce(profile.role, ''))) = 'domiciliario'
        and lower(trim(coalesce(employee.area, ''))) like '%domiciliario%'
    )
    or exists (
      select 1
      from public.public_courier_application_requests as application
      where application.user_id = auth.uid()
        and application.status = 'approved'
    )
  ) then
    raise exception 'Solo los domiciliarios aprobados pueden consultar zonas calientes.'
      using errcode = '42501';
  end if;

  return query
  with day_window as (
    select
      ((now() at time zone 'America/Bogota')::date::timestamp
        at time zone 'America/Bogota') as starts_at,
      (((now() at time zone 'America/Bogota')::date + 1)::timestamp
        at time zone 'America/Bogota') as ends_at
  ),
  daily_orders as (
    select order_row.business_id
    from public.orders as order_row
    cross join day_window
    where coalesce(order_row.is_reservation, false) = false
      and lower(trim(coalesce(order_row.order_type, ''))) in (
        'delivery', 'domicilio'
      )
      and order_row.created_at >= day_window.starts_at
      and order_row.created_at < day_window.ends_at
      and lower(trim(coalesce(order_row.status, ''))) not in (
        'cancelled', 'canceled', 'cancelado',
        'cancelled_by_customer', 'canceled_by_customer'
      )
      and lower(trim(coalesce(order_row.delivery_status, ''))) not in (
        'cancelled', 'canceled', 'cancelado',
        'cancelled_by_customer', 'canceled_by_customer'
      )
  )
  select
    business.id,
    business.name::text,
    business_info.latitude::numeric,
    business_info.longitude::numeric,
    count(*)::bigint
  from daily_orders
  join public.businesses as business
    on business.id = daily_orders.business_id
  join public.business_info
    on business_info.business_id = business.id
  where business_info.latitude between -90 and 90
    and business_info.longitude between -180 and 180
  group by business.id, business.name, business_info.latitude, business_info.longitude
  order by count(*) desc
  limit 5;
end;
$function$;
