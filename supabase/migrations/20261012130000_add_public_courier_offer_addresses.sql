drop function if exists public.get_public_courier_offer_addresses(uuid[]);

create function public.get_public_courier_offer_addresses(
  p_order_ids uuid[]
)
returns table(
  order_id uuid,
  delivery_address text,
  pickup_address text,
  pickup_phone text,
  destination_latitude numeric,
  destination_longitude numeric,
  pickup_latitude numeric,
  pickup_longitude numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    order_row.id,
    order_row.delivery_address::text,
    info.address::text,
    info.whatsapp_phone::text,
    nullif(order_row.metadata #>> '{delivery_location,latitude}', '')::numeric,
    nullif(order_row.metadata #>> '{delivery_location,longitude}', '')::numeric,
    info.latitude::numeric,
    info.longitude::numeric
  from public.orders as order_row
  left join public.business_info as info
    on info.business_id = order_row.business_id
  where order_row.id = any(p_order_ids)
    and exists (
      select 1
      from public.get_public_courier_map_orders() as available_order
      where available_order.order_id = order_row.id
    );
$function$;

revoke all on function public.get_public_courier_offer_addresses(uuid[])
  from public, anon;
grant execute on function public.get_public_courier_offer_addresses(uuid[])
  to authenticated;
