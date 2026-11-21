alter table public.public_courier_application_requests
  add column if not exists location_latitude numeric,
  add column if not exists location_longitude numeric,
  add column if not exists location_updated_at timestamptz;

do $$
declare
  function_definition text;
  updated_definition text;
  old_sort text := 'order by public_order.created_at, dispatch.order_id';
  new_sort text := $sort$
    order by (
      select case
        when courier_location.latitude between -90 and 90
          and courier_location.longitude between -180 and 180
          and business_info.latitude between -90 and 90
          and business_info.longitude between -180 and 180
        then 6371 * 2 * asin(sqrt(least(
          1::double precision,
          sin(radians(courier_location.latitude - business_info.latitude) / 2) ^ 2
            + cos(radians(courier_location.latitude))
              * cos(radians(business_info.latitude))
              * sin(radians(courier_location.longitude - business_info.longitude) / 2) ^ 2
        )))
      end
      from public.orders as candidate_order
      left join public.business_info
        on business_info.business_id = candidate_order.business_id
      left join lateral (
        select
          request.location_latitude::double precision as latitude,
          request.location_longitude::double precision as longitude
        from public.public_courier_application_requests as request
        where request.user_id = v_user_id
          and request.status = 'approved'
          and request.location_updated_at > now() - interval '2 minutes'
        order by request.location_updated_at desc, request.updated_at desc
        limit 1
      ) as courier_location on true
      where candidate_order.id = dispatch.order_id
    ) nulls last,
    public_order.created_at,
    dispatch.order_id
  $sort$;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_my_courier_order_offer'
    and p.pronargs = 0;

  if function_definition is null then
    raise exception 'No se encontró public.get_my_courier_order_offer().';
  end if;
  if position(new_sort in function_definition) > 0 then
    return;
  end if;
  if position(old_sort in function_definition) = 0 then
    raise exception 'No se encontró el orden de ofertas públicas por antigüedad.';
  end if;

  updated_definition := replace(function_definition, old_sort, new_sort);
  execute updated_definition;
end;
$$;
