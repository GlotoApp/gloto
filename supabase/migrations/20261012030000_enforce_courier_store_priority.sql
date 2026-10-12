do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  old_private_gate text := $private_gate$
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
$private_gate$;
  new_private_gate text := $private_gate$
AND (
  order_row.created_at > now() - interval '2 minutes'
  AND EXISTS (
    SELECT 1
    FROM public.employees AS priority_employee
    WHERE priority_employee.auth_user_id = auth.uid()
      AND priority_employee.business_id = order_row.business_id
      AND priority_employee.store_order_priority_enabled = true
      AND priority_employee.store_orders_enabled = true
      AND priority_employee.delivery_available = true
      AND priority_employee.delivery_availability_updated_at > now() - interval '2 minutes'
  )
)
$private_gate$;
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
      raise exception 'No se encontró public.% para aplicar la prioridad de pedidos.',
        function_name;
    end if;
    if position(old_private_gate in function_definition) = 0 then
      raise exception 'No se encontró la regla anterior de prioridad en public.%. Aplica primero la migración de prioridad.',
        function_name;
    end if;

    updated_definition := replace(
      function_definition,
      old_private_gate,
      new_private_gate
    );
    execute updated_definition;
  end loop;
end;
$$;
