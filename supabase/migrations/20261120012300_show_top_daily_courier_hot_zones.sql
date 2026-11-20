do $$
declare
  function_definition text;
  updated_definition text;
  old_top_filter text := $old$
  having count(*) >= 2
  order by count(*) desc;
$old$;
  new_top_filter text := $new$
  order by count(*) desc
  limit 5;
$new$;
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_courier_hot_zones'
    and p.pronargs = 0;

  if function_definition is null then
    raise exception 'No se encontró public.get_courier_hot_zones(). Aplica primero la migración de zonas calientes.';
  end if;
  if position(new_top_filter in function_definition) > 0 then
    return;
  end if;
  if position(old_top_filter in function_definition) = 0 then
    raise exception 'No se encontró el filtro de dos pedidos en public.get_courier_hot_zones().';
  end if;

  updated_definition := replace(
    function_definition,
    old_top_filter,
    new_top_filter
  );
  execute updated_definition;
end;
$$;
