do $$
declare
  function_definition text;
  updated_definition text;
  old_expiry_update text := $old$
  update public.courier_order_dispatches
  set assigned_courier_id = null,
      offer_expires_at = null,
      updated_at = now()
  where phase = 'public'
    and assigned_courier_id is not null
    and offer_expires_at <= now();
$old$;
  new_expiry_update text := $new$
  update public.courier_order_dispatches
  set phase = 'store',
      assigned_courier_id = null,
      store_expires_at = now() + interval '10 seconds',
      offer_expires_at = null,
      updated_at = now()
  where phase = 'public'
    and assigned_courier_id is not null
    and offer_expires_at <= now();
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
    raise exception 'No se encontró public.get_my_courier_order_offer(). Aplica primero la migración de despacho secuencial.';
  end if;
  if position(new_expiry_update in function_definition) > 0 then
    return;
  end if;
  if position(old_expiry_update in function_definition) = 0 then
    raise exception 'No se encontró el bloque de vencimiento público en public.get_my_courier_order_offer().';
  end if;

  updated_definition := replace(
    function_definition,
    old_expiry_update,
    new_expiry_update
  );
  execute updated_definition;
end;
$$;

do $$
declare
  function_definition text;
  updated_definition text;
  old_expiry_update text := $old$
  update public.courier_order_dispatches
  set phase = 'public',
      assigned_courier_id = null,
      offer_expires_at = null,
      updated_at = now()
  where order_id = p_order_id;
$old$;
  new_expiry_update text := $new$
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
$new$;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'skip_my_courier_order_offer'
    and p.pronargs = 2;

  if function_definition is null then
    raise exception 'No se encontró public.skip_my_courier_order_offer(uuid, boolean). Aplica primero la migración de despacho secuencial.';
  end if;
  if position(new_expiry_update in function_definition) > 0 then
    return;
  end if;
  if position(old_expiry_update in function_definition) = 0 then
    raise exception 'No se encontró el bloque de liberación de oferta en public.skip_my_courier_order_offer().';
  end if;

  updated_definition := replace(
    function_definition,
    old_expiry_update,
    new_expiry_update
  );
  execute updated_definition;
end;
$$;
