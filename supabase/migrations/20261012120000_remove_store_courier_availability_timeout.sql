do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
begin
  foreach function_name in array array[
    'get_domiciliario_orders',
    'claim_domiciliario_order'
  ]
  loop
    select pg_get_functiondef(p.oid)
    into function_definition
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = function_name;

    if function_definition is null then
      raise exception 'No se encontró public.% para quitar el vencimiento de disponibilidad.',
        function_name;
    end if;

    updated_definition := regexp_replace(
      function_definition,
      E'(?im)^[ \\t]*and [a-z_]+\\.delivery_availability_updated_at > now\\(\\) - interval ''2 minutes''[ \\t]*\\r?\\n',
      '',
      'g'
    );

    if updated_definition = function_definition then
      raise exception 'No se encontró el vencimiento de 2 minutos en public.%. Revisa la definición activa antes de aplicar esta migración.',
        function_name;
    end if;

    execute updated_definition;
  end loop;
end;
$$;
