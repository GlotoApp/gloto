create or replace function public._require_courier_order_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_expected_transition text;
  v_actual_transition text;
  v_is_delivery boolean;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_reservation, false) = false
      and lower(trim(coalesce(new.order_type, ''))) in ('delivery', 'domicilio')
      and (
        lower(trim(coalesce(new.delivery_status, ''))) in ('picked_up', 'delivered')
        or lower(trim(coalesce(new.status, ''))) in (
          'delivered',
          'entregado'
        )
      ) then
      raise exception 'Un domicilio no puede crearse como recogido o entregado.';
    end if;
    return new;
  end if;

  v_is_delivery :=
    (
      coalesce(old.is_reservation, false) = false
      and lower(trim(coalesce(old.order_type, ''))) in ('delivery', 'domicilio')
    )
    or (
      coalesce(new.is_reservation, false) = false
      and lower(trim(coalesce(new.order_type, ''))) in ('delivery', 'domicilio')
    );

  if coalesce(old.is_reservation, false) = false
    and lower(trim(coalesce(old.order_type, ''))) in ('delivery', 'domicilio')
    and (
      lower(trim(coalesce(new.order_type, ''))) not in ('delivery', 'domicilio')
      or coalesce(new.is_reservation, false)
    )
    and (
      lower(trim(coalesce(old.delivery_status, ''))) in (
        'assigned',
        'picked_up',
        'delivered'
      )
      or old.delivery_courier_id is not null
      or old.public_courier_id is not null
    ) then
    raise exception 'No se puede cambiar el tipo de entrega de este domicilio.';
  end if;

  if v_is_delivery
    and lower(trim(coalesce(old.delivery_status, ''))) is distinct from
      lower(trim(coalesce(new.delivery_status, '')))
    and lower(trim(coalesce(new.delivery_status, ''))) in ('picked_up', 'delivered') then
    if lower(trim(new.delivery_status)) = 'picked_up'
      and lower(trim(coalesce(old.delivery_status, ''))) <> 'assigned' then
      raise exception 'El pedido debe estar asignado antes de confirmar la recogida.';
    end if;
    if lower(trim(new.delivery_status)) = 'delivered'
      and lower(trim(coalesce(old.delivery_status, ''))) <> 'picked_up' then
      raise exception 'El pedido debe estar recogido antes de confirmar la entrega.';
    end if;

    v_expected_transition :=
      new.id::text || ':' || lower(trim(new.delivery_status)) || ':' || auth.uid()::text;
    v_actual_transition :=
      current_setting('gloto.courier_order_code_transition', true);

    if v_actual_transition is distinct from v_expected_transition then
      raise exception 'Se requiere un código válido para confirmar este paso.';
    end if;

    perform set_config('gloto.courier_order_code_transition', '', true);
  elsif v_is_delivery
    and old.status is distinct from new.status
    and lower(trim(coalesce(new.status, ''))) in (
      'delivered',
      'entregado'
    )
    and lower(trim(coalesce(new.delivery_status, ''))) <> 'delivered' then
    v_expected_transition :=
      new.id::text || ':delivered:' || auth.uid()::text;
    v_actual_transition :=
      current_setting('gloto.courier_order_code_transition', true);

    if v_actual_transition is distinct from v_expected_transition then
      raise exception 'La entrega debe confirmarse con el código del cliente.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public._require_courier_order_code()
  from public, anon, authenticated;
