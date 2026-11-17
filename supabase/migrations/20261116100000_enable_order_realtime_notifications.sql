do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'No se encontró public.orders para habilitar las notificaciones de pedidos.';
  end if;

  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'La publicación supabase_realtime no existe.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
