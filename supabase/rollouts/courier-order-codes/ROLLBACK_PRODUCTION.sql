-- Roll back the active courier-code behavior without deleting stored data.
-- This restores the previous order status workflow. Verification tables and
-- generated records are intentionally retained for a later coordinated rollout.

drop trigger if exists orders_require_courier_order_code
  on public.orders;
drop trigger if exists orders_require_courier_order_code_insert
  on public.orders;
drop trigger if exists orders_maintain_delivery_codes
  on public.orders;
drop trigger if exists orders_maintain_delivery_codes_insert
  on public.orders;

drop function if exists public._require_courier_order_code();

do $$
begin
  if to_regprocedure('public.complete_courier_order_step(uuid,text,text)') is not null then
    execute 'revoke all on function public.complete_courier_order_step(uuid,text,text) from public, anon, authenticated';
  end if;

  if to_regprocedure('public.get_store_order_pickup_code(uuid)') is not null then
    execute 'revoke all on function public.get_store_order_pickup_code(uuid) from public, anon, authenticated';
  end if;

  if to_regprocedure('public.get_customer_order_delivery_code(text,text)') is not null then
    execute 'revoke all on function public.get_customer_order_delivery_code(text,text) from public, anon, authenticated';
  end if;
end;
$$;
