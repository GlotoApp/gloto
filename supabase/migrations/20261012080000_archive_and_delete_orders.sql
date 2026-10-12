create table if not exists public.deleted_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  business_id uuid not null,
  order_number text,
  reason_code text not null,
  reason_details text,
  order_snapshot jsonb not null,
  items_snapshot jsonb not null default '[]'::jsonb,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now()
);

create index if not exists deleted_orders_business_deleted_at_idx
  on public.deleted_orders (business_id, deleted_at desc);

alter table public.deleted_orders enable row level security;

drop policy if exists deleted_orders_admin_read on public.deleted_orders;
create policy deleted_orders_admin_read
  on public.deleted_orders
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and lower(trim(coalesce(profile.role, ''))) in (
          'admin', 'owner', 'dueño', 'dueno', 'super_admin', 'superadmin'
        )
        and (
          lower(trim(coalesce(profile.role, ''))) in ('super_admin', 'superadmin')
          or profile.business_id = deleted_orders.business_id
        )
    )
  );

grant select on public.deleted_orders to authenticated;

drop function if exists public.archive_and_delete_order(uuid, text, text);

create or replace function public.archive_and_delete_order(
  p_order_id uuid,
  p_reason_code text,
  p_reason_details text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business_id uuid;
  v_role text;
  v_order public.orders%rowtype;
  v_items jsonb;
  v_reason_code text := lower(trim(coalesce(p_reason_code, '')));
  v_reason_details text := nullif(trim(coalesce(p_reason_details, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para eliminar una orden.';
  end if;

  select profile.business_id, lower(trim(coalesce(profile.role, '')))
  into v_business_id, v_role
  from public.profiles as profile
  where profile.id = auth.uid();

  if not found
    or v_role not in ('admin', 'owner', 'dueño', 'dueno', 'super_admin')
    or (v_business_id is null and v_role <> 'super_admin')
  then
    raise exception 'Solo un administrador puede eliminar órdenes.';
  end if;

  if v_reason_code not in (
    'cancelled_by_customer',
    'duplicate_order',
    'entered_in_error',
    'items_unavailable',
    'payment_issue',
    'other'
  ) then
    raise exception 'Selecciona un motivo válido para eliminar la orden.';
  end if;
  if v_reason_code = 'other' and v_reason_details is null then
    raise exception 'Describe el motivo de eliminación.';
  end if;

  select order_row.*
  into v_order
  from public.orders as order_row
  where order_row.id = p_order_id
    and (v_role = 'super_admin' or order_row.business_id = v_business_id)
  for update;

  if not found then
    raise exception 'La orden no existe o no pertenece a tu negocio.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(order_item)), '[]'::jsonb)
  into v_items
  from public.order_items as order_item
  where order_item.order_id = p_order_id;

  insert into public.deleted_orders (
    order_id,
    business_id,
    order_number,
    reason_code,
    reason_details,
    order_snapshot,
    items_snapshot,
    deleted_by
  )
  values (
    v_order.id,
    v_order.business_id,
    v_order.order_number::text,
    v_reason_code,
    v_reason_details,
    to_jsonb(v_order),
    v_items,
    auth.uid()
  );

  delete from public.orders
  where id = p_order_id
    and business_id = v_order.business_id;

  if not found then
    raise exception 'No se pudo eliminar la orden.';
  end if;
end;
$function$;

revoke all on function public.archive_and_delete_order(uuid, text, text)
  from public, anon;
grant execute on function public.archive_and_delete_order(uuid, text, text)
  to authenticated;
