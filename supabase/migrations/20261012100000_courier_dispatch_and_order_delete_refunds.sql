alter table public.public_courier_ledger
  drop constraint if exists public_courier_ledger_order_id_fkey;

create or replace function public.refund_public_courier_fee_on_order_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_refund_amount numeric;
  v_order_reference text := coalesce(old.order_number::text, old.id::text);
begin
  if old.public_courier_id is null then
    return old;
  end if;

  select coalesce(sum(-ledger.amount), 0)
  into v_refund_amount
  from public.public_courier_ledger as ledger
  where ledger.order_id = old.id
    and ledger.user_id = old.public_courier_id
    and ledger.entry_type = 'delivery_fee'
    and ledger.amount < 0;

  if v_refund_amount <= 0 then
    return old;
  end if;

  if exists (
    select 1
    from public.public_courier_ledger as ledger
    where ledger.user_id = old.public_courier_id
      and ledger.entry_type = 'adjustment'
      and ledger.amount > 0
      and ledger.description = 'Reembolso por cancelación del pedido #'
        || v_order_reference
  ) then
    return old;
  end if;

  insert into public.public_courier_ledger (
    user_id,
    amount,
    entry_type,
    description,
    order_id,
    topup_id
  )
  values (
    old.public_courier_id,
    v_refund_amount,
    'adjustment',
    'Reembolso por eliminación del pedido #' || v_order_reference,
    null,
    null
  );

  return old;
end;
$function$;

drop trigger if exists orders_refund_public_courier_fee_on_delete
  on public.orders;
create trigger orders_refund_public_courier_fee_on_delete
before delete on public.orders
for each row
execute function public.refund_public_courier_fee_on_order_delete();

revoke all on function public.refund_public_courier_fee_on_order_delete()
  from public, anon, authenticated;

do $$
declare
  function_name text;
  function_definition text;
  updated_definition text;
  match_text text := $match$order_row.delivery_status = 'available'$match$;
  replacement_text text := $replacement$order_row.delivery_status = 'available'
      AND lower(trim(coalesce(order_row.status, ''))) = 'dispatched'$replacement$;
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
      raise exception 'No se encontró public.% para exigir despacho desde cocina.',
        function_name;
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
      raise exception 'No se pudo exigir despacho de cocina en public.%.',
        function_name;
    end if;

    execute updated_definition;
  end loop;
end;
$$;
