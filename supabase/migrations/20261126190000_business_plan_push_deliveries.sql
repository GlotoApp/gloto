create table if not exists public.business_plan_push_deliveries (
  subscription_id uuid not null
    references public.subscriptions(id) on delete cascade,
  business_id uuid not null
    references public.businesses(id) on delete cascade,
  grace_day smallint not null check (grace_day between 1 and 3),
  endpoint_hash text not null
    check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (subscription_id, grace_day, endpoint_hash)
);

alter table public.business_plan_push_deliveries enable row level security;
revoke all on public.business_plan_push_deliveries from public, anon, authenticated;
grant all on public.business_plan_push_deliveries to service_role;
