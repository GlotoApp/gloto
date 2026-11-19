alter table public.billing_plan_periods enable row level security;
alter table public.billing_plan_features enable row level security;

drop policy if exists billing_plan_periods_public_read
  on public.billing_plan_periods;
create policy billing_plan_periods_public_read
  on public.billing_plan_periods
  for select
  to anon, authenticated
  using (is_active = true and plan_is_active = true);

drop policy if exists billing_plan_features_public_read
  on public.billing_plan_features;
create policy billing_plan_features_public_read
  on public.billing_plan_features
  for select
  to anon, authenticated
  using (is_active = true);

grant select on public.billing_plan_periods to anon, authenticated;
grant select on public.billing_plan_features to anon, authenticated;
