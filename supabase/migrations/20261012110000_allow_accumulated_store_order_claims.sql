do $$
declare
  function_definition text;
  updated_definition text;
  old_store_priority_gate_with_timeout text := $old_gate_with_timeout$
AND (
  order_row.created_at > now() - interval '20 seconds'
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
$old_gate_with_timeout$;
  old_store_priority_gate_without_timeout text := $old_gate_without_timeout$
AND (
  order_row.created_at > now() - interval '20 seconds'
  AND EXISTS (
    SELECT 1
    FROM public.employees AS priority_employee
    WHERE priority_employee.auth_user_id = auth.uid()
      AND priority_employee.business_id = order_row.business_id
      AND priority_employee.store_order_priority_enabled = true
      AND priority_employee.store_orders_enabled = true
      AND priority_employee.delivery_available = true
  )
)
$old_gate_without_timeout$;
  new_store_priority_gate text := $new_gate$
AND EXISTS (
  SELECT 1
  FROM public.employees AS priority_employee
  WHERE priority_employee.auth_user_id = auth.uid()
    AND priority_employee.business_id = order_row.business_id
    AND priority_employee.store_order_priority_enabled = true
    AND priority_employee.store_orders_enabled = true
    AND priority_employee.delivery_available = true
)
$new_gate$;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc AS p
  join pg_namespace AS n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'claim_domiciliario_order';

  if function_definition is null then
    raise exception 'No se encontró public.claim_domiciliario_order.';
  end if;
  if position(old_store_priority_gate_with_timeout in function_definition) > 0 then
    updated_definition := replace(
      function_definition,
      old_store_priority_gate_with_timeout,
      new_store_priority_gate
    );
  elsif position(old_store_priority_gate_without_timeout in function_definition) > 0 then
    updated_definition := replace(
      function_definition,
      old_store_priority_gate_without_timeout,
      new_store_priority_gate
    );
  else
    raise exception 'No se encontró el filtro de prioridad esperado en public.claim_domiciliario_order. Verifica la definición activa antes de aplicar esta migración.';
  end if;

  execute updated_definition;
end;
$$;
