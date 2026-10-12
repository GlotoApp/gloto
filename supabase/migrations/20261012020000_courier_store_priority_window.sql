alter table public.employees
  add column if not exists store_orders_enabled boolean not null default true,
  add column if not exists store_order_priority_enabled boolean not null default false;

do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  match_text text := 'order_row.delivery_status = ''available''';
  priority_window text := $gate$
AND NOT EXISTS (
  SELECT 1
  FROM public.employees AS priority_employee
  WHERE priority_employee.business_id = order_row.business_id
    AND priority_employee.auth_user_id IS NOT NULL
    AND priority_employee.store_order_priority_enabled = true
    AND priority_employee.store_orders_enabled = true
    AND priority_employee.delivery_available = true
    AND priority_employee.delivery_availability_updated_at > now() - interval '2 minutes'
    AND order_row.created_at > now() - interval '2 minutes'
)
$gate$;
begin
  foreach function_name in array array[
    'get_public_courier_map_orders',
    'claim_public_courier_order'
  ]
  loop
    select pg_get_functiondef(p.oid)
    into function_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = function_name;

    if function_definition is null then
      raise exception 'No se encontró public.% para configurar la prioridad de pedidos.',
        function_name;
    end if;

    if position(match_text in function_definition) = 0 then
      raise exception 'No se pudo localizar el filtro de pedidos disponibles en public.%.',
        function_name;
    end if;

    updated_definition := replace(
      function_definition,
      match_text,
      match_text || E'\n  ' || priority_window
    );

    if updated_definition = function_definition then
      raise exception 'No se aplicó la prioridad de pedidos en public.%.',
        function_name;
    end if;

    execute updated_definition;
  end loop;
end;
$$;

do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  match_text text := 'order_row.delivery_status = ''available''';
  priority_window text := $gate$
AND (
  order_row.created_at <= now() - interval '2 minutes'
  OR EXISTS (
    SELECT 1
    FROM public.employees AS priority_employee
    WHERE priority_employee.auth_user_id = auth.uid()
      AND priority_employee.business_id = order_row.business_id
      AND priority_employee.store_order_priority_enabled = true
      AND priority_employee.store_orders_enabled = true
  )
  OR NOT EXISTS (
    SELECT 1
    FROM public.employees AS priority_employee
    WHERE priority_employee.business_id = order_row.business_id
      AND priority_employee.auth_user_id IS NOT NULL
      AND priority_employee.store_order_priority_enabled = true
      AND priority_employee.store_orders_enabled = true
      AND priority_employee.delivery_available = true
      AND priority_employee.delivery_availability_updated_at > now() - interval '2 minutes'
  )
)
$gate$;
begin
  foreach function_name in array array[
    'get_domiciliario_orders',
    'claim_domiciliario_order'
  ]
  loop
    select pg_get_functiondef(p.oid)
    into function_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = function_name;

    if function_definition is null then
      raise exception 'No se encontró public.% para configurar la prioridad de pedidos.',
        function_name;
    end if;

    if position(match_text in function_definition) = 0 then
      raise exception 'No se pudo localizar el filtro de pedidos disponibles en public.%.',
        function_name;
    end if;

    updated_definition := replace(
      function_definition,
      match_text,
      match_text || E'\n  ' || priority_window
    );

    if updated_definition = function_definition then
      raise exception 'No se aplicó la prioridad de pedidos en public.%.',
        function_name;
    end if;

    execute updated_definition;
  end loop;
end;
$$;
