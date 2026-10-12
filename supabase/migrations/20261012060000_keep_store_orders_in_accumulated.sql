do $$
declare
  function_definition text;
  updated_definition text;
  match_text text := 'order_row.created_at > now() - interval ''20 seconds''';
  replacement_text text := $predicate$
(
  order_row.created_at > now() - interval '20 seconds'
  OR EXISTS (
    SELECT 1
    FROM public.employees AS accumulated_employee
    WHERE accumulated_employee.auth_user_id = auth.uid()
      AND accumulated_employee.business_id = order_row.business_id
      AND accumulated_employee.store_order_priority_enabled = true
      AND accumulated_employee.store_orders_enabled = true
  )
)
$predicate$;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_domiciliario_orders';

  if function_definition is null then
    raise exception 'No se encontró public.get_domiciliario_orders para conservar los pedidos acumulados de tienda.';
  end if;
  if position(match_text in function_definition) = 0 then
    raise exception 'No se encontró el límite de 20 segundos en public.get_domiciliario_orders. Aplica primero la migración 20261012050000.';
  end if;

  updated_definition := replace(
    function_definition,
    match_text,
    replacement_text
  );
  execute updated_definition;
end;
$$;
