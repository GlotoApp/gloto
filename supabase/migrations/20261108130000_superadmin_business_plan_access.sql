create or replace function public.get_business_plan_access(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
  v_subscription public.subscriptions%rowtype;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_tickets_used bigint;
  v_ticket_limit integer;
  v_plan_text text;
begin
  select lower(trim(coalesce(profile.role, '')))
  into v_role
  from public.profiles as profile
  where profile.id = auth.uid();

  if v_role not in ('super_admin', 'superadmin') then
    raise exception 'Solo los superadministradores pueden consultar otra tienda.';
  end if;

  if p_business_id is null then
    raise exception 'Selecciona una tienda válida.';
  end if;

  select subscription_row.*
  into v_subscription
  from public.subscriptions as subscription_row
  where subscription_row.business_id = p_business_id
    and subscription_row.status in ('active', 'suspended', 'expired')
  order by subscription_row.created_at desc
  limit 1;

  if not found then
    v_tickets_used := 0;
    v_ticket_limit := 1000;
    return jsonb_build_object(
      'plan_code', null,
      'plan_name', 'Sin plan',
      'ticket_limit', v_ticket_limit,
      'tickets_used', v_tickets_used,
      'tickets_remaining', v_ticket_limit
    );
  end if;

  v_cycle_start := v_subscription.starts_at;
  v_cycle_end := coalesce(v_subscription.ends_at, now());
  v_plan_text := lower(concat_ws(
    ' ',
    coalesce(v_subscription.plan_code, ''),
    coalesce(v_subscription.plan_name, '')
  ));

  if v_plan_text like '%premium%' then
    v_ticket_limit := null;
  elsif v_plan_text like '%pro%' then
    v_ticket_limit := 2000;
  else
    v_ticket_limit := 1000;
  end if;

  with consumed_orders as (
    select order_row.id as order_id, order_row.created_at
    from public.orders as order_row
    where order_row.business_id = p_business_id
      and coalesce(order_row.is_reservation, false) = false
      and lower(trim(coalesce(order_row.status, ''))) not in ('cancelled', 'cancelado')
      and order_row.created_at >= v_cycle_start
      and order_row.created_at <= v_cycle_end

    union

    select deleted_order.order_id,
           coalesce(
             nullif(deleted_order.order_snapshot->>'created_at', '')::timestamptz,
             deleted_order.deleted_at
           )
    from public.deleted_orders as deleted_order
    where deleted_order.business_id = p_business_id
      and coalesce(
        (deleted_order.order_snapshot->>'is_reservation')::boolean,
        false
      ) = false
      and lower(trim(coalesce(deleted_order.order_snapshot->>'status', ''))) not in ('cancelled', 'cancelado')
      and coalesce(
        nullif(deleted_order.order_snapshot->>'created_at', '')::timestamptz,
        deleted_order.deleted_at
      ) >= v_cycle_start
      and coalesce(
        nullif(deleted_order.order_snapshot->>'created_at', '')::timestamptz,
        deleted_order.deleted_at
      ) <= v_cycle_end
  )
  select count(distinct order_id)
  into v_tickets_used
  from consumed_orders;

  return jsonb_build_object(
    'plan_code', v_subscription.plan_code,
    'plan_name', v_subscription.plan_name,
    'ticket_limit', v_ticket_limit,
    'tickets_used', v_tickets_used,
    'tickets_remaining',
      case
        when v_ticket_limit is null then null
        else greatest(v_ticket_limit - v_tickets_used, 0)
      end
  );
end;
$function$;

revoke all on function public.get_business_plan_access(uuid) from public, anon;
grant execute on function public.get_business_plan_access(uuid) to authenticated;
