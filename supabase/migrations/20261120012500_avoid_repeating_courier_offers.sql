do $$
declare
  function_definition text;
  updated_definition text;
  old_store_filter text := $old$
      and store_order.delivery_status = 'available'
    order by store_order.created_at, dispatch.order_id
$old$;
  new_store_filter text := $new$
      and store_order.delivery_status = 'available'
      and not exists (
        select 1
        from public.courier_order_dispatch_attempts as attempt
        where attempt.order_id = dispatch.order_id
          and attempt.courier_id = v_user_id
          and attempt.outcome in ('declined', 'expired', 'store_timeout')
      )
    order by store_order.created_at, dispatch.order_id
$new$;
  old_public_filter text := $old$
      and not exists (
        select 1
        from public.courier_order_dispatch_attempts as attempt
        where attempt.courier_id = v_user_id
          and attempt.attempted_at > now() - interval '15 seconds'
      )
$old$;
  new_public_filter text := $new$
      and not exists (
        select 1
        from public.courier_order_dispatch_attempts as attempt
        where attempt.order_id = dispatch.order_id
          and attempt.courier_id = v_user_id
          and attempt.outcome in ('declined', 'expired', 'store_timeout')
      )
$new$;
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

  updated_definition := function_definition;

  if position(new_store_filter in updated_definition) = 0 then
    if position(old_store_filter in updated_definition) = 0 then
      raise exception 'No se encontró la selección de ofertas de tienda.';
    end if;
    updated_definition := replace(
      updated_definition,
      old_store_filter,
      new_store_filter
    );
  end if;

  if position(new_public_filter in updated_definition) = 0 then
    if position(old_public_filter in updated_definition) = 0 then
      raise exception 'No se encontró el filtro de repetición de ofertas públicas.';
    end if;
    updated_definition := replace(
      updated_definition,
      old_public_filter,
      new_public_filter
    );
  end if;

  if updated_definition <> function_definition then
    execute updated_definition;
  end if;
end;
$$;
