do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  match_text text := 'order_row.created_at > now() - interval ''2 minutes''';
  replacement_text text := 'order_row.created_at > now() - interval ''20 seconds''';
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
      raise exception 'No se encontró public.% para configurar la ventana pública de pedidos.',
        function_name;
    end if;
    if position(match_text in function_definition) = 0 then
      raise exception 'No se encontró la ventana pública anterior en public.%. Aplica primero la migración 20261012020000.',
        function_name;
    end if;

    updated_definition := replace(
      function_definition,
      match_text,
      replacement_text
    );
    execute updated_definition;
  end loop;

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
      raise exception 'No se encontró public.% para configurar la ventana prioritaria de tienda.',
        function_name;
    end if;
    if position(match_text in function_definition) = 0 then
      raise exception 'No se encontró la ventana prioritaria anterior en public.%. Aplica primero la migración 20261012030000.',
        function_name;
    end if;

    updated_definition := replace(
      function_definition,
      match_text,
      replacement_text
    );
    execute updated_definition;
  end loop;
end;
$$;
