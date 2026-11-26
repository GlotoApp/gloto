create table if not exists public.order_push_subscriptions (
  endpoint text primary key
    check (length(endpoint) <= 2048 and endpoint ~ '^https://[^[:space:]]+$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 16 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_push_subscriptions_business_id_idx
  on public.order_push_subscriptions (business_id);

alter table public.order_push_subscriptions enable row level security;
revoke all on public.order_push_subscriptions from public, anon, authenticated;
grant all on public.order_push_subscriptions to service_role;

create or replace function public.register_order_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_business_id uuid;
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión para activar las notificaciones.';
  end if;

  if p_endpoint is null
    or length(p_endpoint) > 2048
    or p_endpoint !~ '^https://[^[:space:]]+$'
    or p_p256dh is null
    or p_p256dh !~ '^[A-Za-z0-9_-]{40,200}$'
    or p_auth is null
    or p_auth !~ '^[A-Za-z0-9_-]{16,100}$' then
    raise exception 'La suscripción de notificaciones no es válida.';
  end if;

  select profile.business_id
  into current_business_id
  from public.profiles as profile
  where profile.id = current_user_id;

  if current_business_id is null then
    raise exception 'No se encontró el negocio asociado a esta cuenta.';
  end if;

  insert into public.order_push_subscriptions (
    endpoint,
    user_id,
    business_id,
    p256dh,
    auth,
    updated_at
  ) values (
    p_endpoint,
    current_user_id,
    current_business_id,
    p_p256dh,
    p_auth,
    now()
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      business_id = excluded.business_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      updated_at = now();
end;
$$;

revoke all on function public.register_order_push_subscription(text, text, text)
  from public, anon;
grant execute on function public.register_order_push_subscription(text, text, text)
  to authenticated;
