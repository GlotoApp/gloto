do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  match_text text := 'order_row.delivery_status = ''available''';
  replacement_text text := $predicate$
order_row.delivery_status = 'available'
      AND order_row.created_at >= now() - interval '6 hours'
$predicate$;
  expiration_predicate text := 'order_row.created_at >= now() - interval ''6 hours''';
begin
  foreach function_name in array array[
    'get_domiciliario_orders',
    'claim_domiciliario_order',
    'get_public_courier_map_orders',
    'claim_public_courier_order'
  ]
  loop
    select pg_get_functiondef(p.oid)
    into function_definition
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = function_name;

    if function_definition is null then
      raise exception 'No se encontró public.% para limitar la antigüedad de las ofertas de domicilio.',
        function_name;
    end if;

    if position(expiration_predicate in function_definition) > 0 then
      continue;
    end if;

    if position(match_text in function_definition) = 0 then
      raise exception 'No se encontró el filtro de ofertas disponibles en public.%.',
        function_name;
    end if;

    updated_definition := replace(
      function_definition,
      match_text,
      replacement_text
    );

    if updated_definition = function_definition then
      raise exception 'No se pudo limitar a seis horas las ofertas en public.%.',
        function_name;
    end if;

    execute updated_definition;
  end loop;
end;
$$;
