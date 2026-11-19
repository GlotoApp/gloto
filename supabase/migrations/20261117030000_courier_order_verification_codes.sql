create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists gloto_private;
revoke all on schema gloto_private from public, anon, authenticated;
set local search_path = public, extensions, gloto_private, pg_temp;

do $$
begin
  if to_regprocedure('public.set_domiciliario_order_status(uuid,text)') is null
    or to_regprocedure('public.set_public_courier_order_status(uuid,text)') is null then
    raise exception
      'No se encontraron las funciones de estado de domiciliarios esperadas.';
  end if;
end;
$$;

create table if not exists gloto_private.courier_order_code_secrets (
  secret_name text primary key,
  secret_value text not null,
  created_at timestamptz not null default now()
);

revoke all on gloto_private.courier_order_code_secrets
  from public, anon, authenticated;

insert into gloto_private.courier_order_code_secrets (
  secret_name,
  secret_value
)
values (
  'gloto_courier_order_code_key',
  encode(gen_random_bytes(32), 'hex')
)
on conflict (secret_name) do nothing;

create table if not exists public.order_delivery_verifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  purpose text not null check (purpose in ('pickup', 'delivery')),
  courier_id uuid,
  code_digest bytea not null,
  code_ciphertext bytea not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  verified_by uuid,
  invalidated_at timestamptz
);

create table if not exists public.order_delivery_verification_events (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null
    references public.order_delivery_verifications(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  purpose text not null check (purpose in ('pickup', 'delivery')),
  actor_id uuid,
  outcome text not null check (outcome in ('failed', 'verified')),
  created_at timestamptz not null default now()
);

create unique index if not exists order_delivery_verifications_one_active_code
  on public.order_delivery_verifications (order_id, purpose)
  where consumed_at is null and invalidated_at is null;

alter table public.order_delivery_verifications enable row level security;
alter table public.order_delivery_verification_events enable row level security;
revoke all on public.order_delivery_verifications from public, anon, authenticated;
revoke all on public.order_delivery_verification_events from public, anon, authenticated;

create or replace function public._courier_order_code_key()
returns text
language plpgsql
security definer
set search_path = public, extensions, gloto_private, pg_temp
as $function$
declare
  v_secret text;
begin
  select secret_value
  into v_secret
  from gloto_private.courier_order_code_secrets
  where secret_name = 'gloto_courier_order_code_key'
  limit 1;

  if v_secret is null then
    raise exception 'No está disponible la clave privada de códigos de domicilio.';
  end if;

  return v_secret;
end;
$function$;

revoke all on function public._courier_order_code_key() from public, anon, authenticated;

create or replace function public._issue_order_delivery_code(
  p_order_id uuid,
  p_purpose text,
  p_courier_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, gloto_private, pg_temp
as $function$
declare
  v_secret text;
  v_bytes bytea;
  v_number integer;
  v_code text;
  v_other_code bytea;
begin
  if p_purpose not in ('pickup', 'delivery') then
    raise exception 'Propósito de código no válido.';
  end if;

  v_secret := public._courier_order_code_key();

  update public.order_delivery_verifications
  set invalidated_at = now()
  where order_id = p_order_id
    and purpose = p_purpose
    and consumed_at is null
    and invalidated_at is null;

  loop
    v_bytes := gen_random_bytes(2);
    v_number := get_byte(v_bytes, 0) * 256 + get_byte(v_bytes, 1);
    if v_number >= 60000 then
      continue;
    end if;
    v_code := lpad((v_number % 10000)::text, 4, '0');

    select code_ciphertext
    into v_other_code
    from public.order_delivery_verifications
    where order_id = p_order_id
      and purpose <> p_purpose
      and consumed_at is null
      and invalidated_at is null
    limit 1;

    if not found or pgp_sym_decrypt(v_other_code, v_secret) <> v_code then
      exit;
    end if;
  end loop;

  insert into public.order_delivery_verifications (
    order_id,
    purpose,
    courier_id,
    code_digest,
    code_ciphertext
  )
  values (
    p_order_id,
    p_purpose,
    p_courier_id,
    hmac(
      v_code || ':' || p_order_id::text || ':' || p_purpose,
      v_secret,
      'sha256'
    ),
    pgp_sym_encrypt(v_code, v_secret, 'cipher-algo=aes256')
  );
end;
$function$;

revoke all on function public._issue_order_delivery_code(uuid, text, uuid)
  from public, anon, authenticated;

create or replace function public._maintain_order_delivery_codes()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_previous_courier uuid;
  v_next_courier uuid;
  v_is_delivery boolean;
begin
  v_is_delivery :=
    coalesce(new.is_reservation, false) = false
    and lower(trim(coalesce(new.order_type, ''))) in ('delivery', 'domicilio');

  if not v_is_delivery then
    if tg_op = 'UPDATE'
      and coalesce(old.is_reservation, false) = false
      and lower(trim(coalesce(old.order_type, ''))) in ('delivery', 'domicilio') then
      update public.order_delivery_verifications
      set invalidated_at = now()
      where order_id = new.id
        and consumed_at is null
        and invalidated_at is null;
    end if;
    return new;
  end if;

  if lower(trim(coalesce(new.status, ''))) in (
    'cancelled',
    'cancelado',
    'cancelled_by_customer'
  ) then
    if tg_op = 'UPDATE' then
      update public.order_delivery_verifications
      set invalidated_at = now()
      where order_id = new.id
        and consumed_at is null
        and invalidated_at is null;
    end if;
    return new;
  end if;

  v_next_courier := coalesce(new.public_courier_id, new.delivery_courier_id);

  if tg_op = 'INSERT' then
    perform public._issue_order_delivery_code(new.id, 'delivery');
    if v_next_courier is not null then
      perform public._issue_order_delivery_code(
        new.id,
        'pickup',
        v_next_courier
      );
    end if;
    return new;
  end if;

  v_previous_courier := coalesce(old.public_courier_id, old.delivery_courier_id);

  if v_next_courier is distinct from v_previous_courier then
    update public.order_delivery_verifications
    set invalidated_at = now()
    where order_id = new.id
      and consumed_at is null
      and invalidated_at is null;

    if v_next_courier is not null then
      perform public._issue_order_delivery_code(new.id, 'delivery');
      perform public._issue_order_delivery_code(
        new.id,
        'pickup',
        v_next_courier
      );
    end if;
  elsif lower(trim(coalesce(new.delivery_status, ''))) = 'assigned'
    and lower(trim(coalesce(old.delivery_status, ''))) is distinct from 'assigned'
    and v_next_courier is not null then
    perform public._issue_order_delivery_code(
      new.id,
      'pickup',
      v_next_courier
    );
  elsif lower(trim(coalesce(new.delivery_status, ''))) in ('cancelled', 'canceled')
    or lower(trim(coalesce(new.status, ''))) in (
      'cancelled',
      'cancelado',
      'cancelled_by_customer'
    ) then
    update public.order_delivery_verifications
    set invalidated_at = now()
    where order_id = new.id
      and consumed_at is null
      and invalidated_at is null;
  end if;

  return new;
end;
$function$;

revoke all on function public._maintain_order_delivery_codes()
  from public, anon, authenticated;

drop trigger if exists orders_maintain_delivery_codes
  on public.orders;
drop trigger if exists orders_maintain_delivery_codes_insert
  on public.orders;
create trigger orders_maintain_delivery_codes_insert
after insert
on public.orders
for each row
execute function public._maintain_order_delivery_codes();
create trigger orders_maintain_delivery_codes
after update of
  status,
  order_type,
  is_reservation,
  delivery_status,
  delivery_courier_id,
  public_courier_id
on public.orders
for each row
execute function public._maintain_order_delivery_codes();

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

drop trigger if exists orders_require_courier_order_code
  on public.orders;
drop trigger if exists orders_require_courier_order_code_insert
  on public.orders;
create trigger orders_require_courier_order_code
before update of status, delivery_status, order_type, is_reservation
on public.orders
for each row
execute function public._require_courier_order_code();
create trigger orders_require_courier_order_code_insert
before insert
on public.orders
for each row
execute function public._require_courier_order_code();

create or replace function public.complete_courier_order_step(
  p_order_id uuid,
  p_status text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, gloto_private, pg_temp
as $function$
declare
  v_order public.orders%rowtype;
  v_verification public.order_delivery_verifications%rowtype;
  v_purpose text;
  v_key text;
  v_expected_digest bytea;
  v_is_public_courier boolean;
  v_next_attempts integer;
  v_current_delivery_status text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'unauthorized');
  end if;

  if p_status is null or p_status not in ('picked_up', 'delivered') then
    return jsonb_build_object('success', false, 'reason', 'invalid_step');
  end if;
  if p_status = 'picked_up' then
    v_purpose := 'pickup';
  else
    v_purpose := 'delivery';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or coalesce(v_order.is_reservation, false)
    or lower(trim(coalesce(v_order.order_type, ''))) not in ('delivery', 'domicilio') then
    return jsonb_build_object('success', false, 'reason', 'order_unavailable');
  end if;

  if v_order.public_courier_id = auth.uid() then
    v_is_public_courier := true;
  elsif v_order.delivery_courier_id = auth.uid() then
    v_is_public_courier := false;
  else
    return jsonb_build_object('success', false, 'reason', 'not_assigned');
  end if;

  if (p_status = 'picked_up' and v_order.delivery_status <> 'assigned')
    or (p_status = 'delivered' and v_order.delivery_status <> 'picked_up') then
    return jsonb_build_object('success', false, 'reason', 'invalid_step');
  end if;

  select *
  into v_verification
  from public.order_delivery_verifications
  where order_id = p_order_id
    and purpose = v_purpose
    and courier_id is not distinct from case
      when v_purpose = 'pickup' then auth.uid()
      else null::uuid
    end
    and consumed_at is null
    and invalidated_at is null
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'code_unavailable');
  end if;

  if v_verification.locked_until > now() then
    return jsonb_build_object('success', false, 'reason', 'temporarily_locked');
  elsif v_verification.locked_until is not null then
    update public.order_delivery_verifications
    set failed_attempts = 0,
        locked_until = null
    where id = v_verification.id;
    v_verification.failed_attempts := 0;
  end if;

  if p_code !~ '^[0-9]{4}$' then
    v_expected_digest := null;
  else
    v_key := public._courier_order_code_key();
    v_expected_digest := hmac(
      p_code || ':' || p_order_id::text || ':' || v_purpose,
      v_key,
      'sha256'
    );
  end if;

  if v_expected_digest is null
    or v_expected_digest <> v_verification.code_digest then
    v_next_attempts := v_verification.failed_attempts + 1;
    update public.order_delivery_verifications
    set failed_attempts = v_next_attempts,
        locked_until = case
          when v_next_attempts >= 5 then now() + interval '15 minutes'
          else null
        end
    where id = v_verification.id;
    insert into public.order_delivery_verification_events (
      verification_id,
      order_id,
      purpose,
      actor_id,
      outcome
    )
    values (
      v_verification.id,
      p_order_id,
      v_purpose,
      auth.uid(),
      'failed'
    );
    return jsonb_build_object(
      'success',
      false,
      'reason',
      case when v_next_attempts >= 5
        then 'temporarily_locked'
        else 'invalid_code'
      end
    );
  end if;

  perform set_config(
    'gloto.courier_order_code_transition',
    p_order_id::text || ':' || p_status || ':' || auth.uid()::text,
    true
  );

  if v_is_public_courier then
    perform public.set_public_courier_order_status(p_order_id, p_status);
  else
    perform public.set_domiciliario_order_status(p_order_id, p_status);
  end if;

  select delivery_status
  into v_current_delivery_status
  from public.orders
  where id = p_order_id;

  if v_current_delivery_status is distinct from p_status then
    raise exception 'La función de estado no completó la transición solicitada.';
  end if;

  update public.order_delivery_verifications
  set consumed_at = now(),
      verified_by = auth.uid()
  where id = v_verification.id
    and consumed_at is null
    and invalidated_at is null;

  insert into public.order_delivery_verification_events (
    verification_id,
    order_id,
    purpose,
    actor_id,
    outcome
  )
  values (
    v_verification.id,
    p_order_id,
    v_purpose,
    auth.uid(),
    'verified'
  );

  return jsonb_build_object('success', true);
end;
$function$;

revoke all on function public.complete_courier_order_step(uuid, text, text)
  from public, anon;
grant execute on function public.complete_courier_order_step(uuid, text, text)
  to authenticated;

create or replace function public.get_store_order_pickup_code(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, gloto_private, pg_temp
as $function$
declare
  v_order public.orders%rowtype;
  v_business_id uuid;
  v_profile_business_id uuid;
  v_role text;
  v_secret text;
  v_code bytea;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para consultar el código.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found
    or lower(trim(coalesce(v_order.order_type, ''))) not in ('delivery', 'domicilio')
    or coalesce(v_order.is_reservation, false)
    or v_order.delivery_status <> 'assigned' then
    raise exception 'El código de recogida no está disponible.';
  end if;

  if auth.uid() in (
    v_order.delivery_courier_id,
    v_order.public_courier_id
  ) then
    raise exception 'El domiciliario no puede consultar el código de recogida.';
  end if;

  select profiles.business_id, lower(trim(coalesce(profiles.role, '')))
  into v_profile_business_id, v_role
  from public.profiles
  where profiles.id = auth.uid();

  if v_role in ('superadmin', 'super_admin') then
    v_business_id := v_order.business_id;
  elsif v_profile_business_id = v_order.business_id
    and v_role in ('admin', 'owner', 'dueño', 'dueno', 'administrador', 'propietario') then
    v_business_id := v_profile_business_id;
  elsif exists (
    select 1
    from public.employees
    where employees.auth_user_id = auth.uid()
      and employees.business_id = v_order.business_id
      and lower(trim(coalesce(employees.area, ''))) not like '%domiciliario%'
      and coalesce(v_role, '') not in ('domiciliario')
  ) then
    v_business_id := v_order.business_id;
  else
    raise exception 'No tienes permiso para consultar este código.';
  end if;

  select code_ciphertext
  into v_code
  from public.order_delivery_verifications
  where order_id = p_order_id
    and purpose = 'pickup'
    and courier_id = coalesce(v_order.public_courier_id, v_order.delivery_courier_id)
    and consumed_at is null
    and invalidated_at is null
  limit 1;

  if v_code is null then
    raise exception 'El código de recogida no está disponible.';
  end if;

  v_secret := public._courier_order_code_key();
  return pgp_sym_decrypt(v_code, v_secret);
end;
$function$;

revoke all on function public.get_store_order_pickup_code(uuid)
  from public, anon;
grant execute on function public.get_store_order_pickup_code(uuid)
  to authenticated;

create or replace function public.get_customer_order_delivery_code(
  p_order_number text,
  p_token text
)
returns text
language plpgsql
security definer
set search_path = public, extensions, gloto_private, pg_temp
as $function$
declare
  v_order public.orders%rowtype;
  v_secret text;
  v_code bytea;
begin
  if nullif(trim(p_order_number), '') is null
    or nullif(trim(p_token), '') is null then
    return null;
  end if;

  select *
  into v_order
  from public.orders
  where order_number::text = p_order_number
    and metadata ->> 'tracking_token' = p_token
    and coalesce(is_reservation, false) = false
    and lower(trim(coalesce(order_type, ''))) in ('delivery', 'domicilio')
    and delivery_status = 'picked_up'
  limit 1;

  if not found then
    return null;
  end if;

  select code_ciphertext
  into v_code
  from public.order_delivery_verifications
  where order_id = v_order.id
    and purpose = 'delivery'
    and consumed_at is null
    and invalidated_at is null
  limit 1;

  if v_code is null then
    return null;
  end if;

  v_secret := public._courier_order_code_key();
  return pgp_sym_decrypt(v_code, v_secret);
end;
$function$;

revoke all on function public.get_customer_order_delivery_code(text, text)
  from public;
grant execute on function public.get_customer_order_delivery_code(text, text)
  to anon, authenticated;

do $$
declare
  order_row record;
begin
  for order_row in
    select id, delivery_status, coalesce(public_courier_id, delivery_courier_id) as courier_id
    from public.orders
    where coalesce(is_reservation, false) = false
      and lower(trim(coalesce(order_type, ''))) in ('delivery', 'domicilio')
      and lower(trim(coalesce(status, ''))) not in (
        'delivered',
        'entregado',
        'completado',
        'complete',
        'completed',
        'cancelled',
        'cancelado',
        'cancelled_by_customer'
      )
      and coalesce(delivery_status, '') <> 'delivered'
  loop
    if not exists (
      select 1
      from public.order_delivery_verifications
      where order_id = order_row.id
        and purpose = 'delivery'
        and consumed_at is null
        and invalidated_at is null
    ) then
      perform public._issue_order_delivery_code(order_row.id, 'delivery');
    end if;

    if order_row.delivery_status = 'assigned'
      and order_row.courier_id is not null
      and not exists (
        select 1
        from public.order_delivery_verifications
        where order_id = order_row.id
          and purpose = 'pickup'
          and consumed_at is null
          and invalidated_at is null
      ) then
      perform public._issue_order_delivery_code(
        order_row.id,
        'pickup',
        order_row.courier_id
      );
    end if;
  end loop;
end;
$$;
