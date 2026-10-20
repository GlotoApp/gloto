create or replace function public.delete_all_deleted_orders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business_id uuid;
  v_role text;
  v_deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para eliminar el historial.';
  end if;

  select profile.business_id, lower(trim(coalesce(profile.role, '')))
  into v_business_id, v_role
  from public.profiles as profile
  where profile.id = auth.uid();

  if not found
    or v_role not in ('admin', 'owner', 'dueño', 'dueno')
    or v_business_id is null
  then
    raise exception 'Solo un administrador o dueño puede eliminar el historial.';
  end if;

  delete from public.deleted_orders
  where business_id = v_business_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$function$;

revoke all on function public.delete_all_deleted_orders() from public, anon;
grant execute on function public.delete_all_deleted_orders() to authenticated;
