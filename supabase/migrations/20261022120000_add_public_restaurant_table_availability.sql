create or replace function public.get_public_restaurant_tables(p_business_id uuid)
returns table(label text, available boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    floor_table.label,
    not exists (
      select 1
      from public.orders as order_row
      where order_row.business_id = floor_table.business_id
        and order_row.order_type = 'table'
        and btrim(order_row.mesa::text) = btrim(floor_table.label)
        and lower(btrim(coalesce(order_row.table_status, ''))) <> 'cerrada'
        and (
          (
            (
              coalesce(order_row.is_reservation, false)
              or lower(btrim(coalesce(order_row.table_status, ''))) = 'reserva'
            )
            and order_row.fecha_reserva =
              (now() at time zone 'America/Bogota')::date
          )
          or (
            not coalesce(order_row.is_reservation, false)
            and lower(btrim(coalesce(order_row.table_status, ''))) <> 'reserva'
            and case
              when order_row.table_status is not null then
                lower(btrim(order_row.table_status)) not in ('', 'clean', 'limpia')
              else lower(btrim(coalesce(order_row.status, ''))) in (
                'pending',
                'confirmed',
                'preparing',
                'ready',
                'complete'
              )
            end
          )
        )
    ) as available
  from public.restaurant_floor_tables as floor_table
  where floor_table.business_id = p_business_id
  order by
    case when floor_table.label ~ '^[0-9]+$' then 0 else 1 end,
    case
      when floor_table.label ~ '^[0-9]+$' then floor_table.label::numeric
      else null
    end,
    floor_table.label;
$function$;

revoke all on function public.get_public_restaurant_tables(uuid) from public;
grant execute on function public.get_public_restaurant_tables(uuid) to anon, authenticated;

create or replace function public.broadcast_restaurant_table_availability()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' and new.order_type is distinct from 'table' then
      return new;
    elsif tg_op = 'DELETE' and old.order_type is distinct from 'table' then
      return old;
    elsif tg_op = 'UPDATE' then
      if old.order_type is distinct from 'table'
        and new.order_type is distinct from 'table' then
        return new;
      end if;
      if old.business_id is not distinct from new.business_id
        and old.order_type is not distinct from new.order_type
        and old.mesa is not distinct from new.mesa
        and old.table_status is not distinct from new.table_status
        and old.is_reservation is not distinct from new.is_reservation
        and old.fecha_reserva is not distinct from new.fecha_reserva
        and old.status is not distinct from new.status then
        return new;
      end if;
    end if;
  end if;

  v_business_id := case
    when tg_op = 'DELETE' then old.business_id
    else new.business_id
  end;

  if v_business_id is not null then
    perform realtime.send(
      jsonb_build_object('business_id', v_business_id),
      'availability_changed',
      'restaurant-table-availability:' || v_business_id::text,
      false
    );
  end if;

  if tg_op = 'UPDATE' and old.business_id is distinct from new.business_id
    and old.business_id is not null then
    perform realtime.send(
      jsonb_build_object('business_id', old.business_id),
      'availability_changed',
      'restaurant-table-availability:' || old.business_id::text,
      false
    );
  end if;

  return null;
end;
$function$;

drop trigger if exists broadcast_order_table_availability
  on public.orders;
create trigger broadcast_order_table_availability
  after insert or update or delete on public.orders
  for each row execute function public.broadcast_restaurant_table_availability();

drop trigger if exists broadcast_floor_table_availability
  on public.restaurant_floor_tables;
create trigger broadcast_floor_table_availability
  after insert or update or delete on public.restaurant_floor_tables
  for each row execute function public.broadcast_restaurant_table_availability();
