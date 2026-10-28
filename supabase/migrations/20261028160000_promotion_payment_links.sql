create table if not exists public.promotion_payment_links (
  duration_days smallint primary key,
  payment_url text not null,
  amount numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint promotion_payment_links_duration_check
    check (duration_days in (7, 14, 21, 30)),
  constraint promotion_payment_links_url_check
    check (payment_url ~* '^https?://'),
  constraint promotion_payment_links_amount_check
    check (amount >= 0)
);

alter table public.promotion_payment_links enable row level security;

drop policy if exists promotion_payment_links_authenticated_read
  on public.promotion_payment_links;
create policy promotion_payment_links_authenticated_read
  on public.promotion_payment_links
  for select to authenticated
  using (true);

drop policy if exists promotion_payment_links_superadmin_manage
  on public.promotion_payment_links;
create policy promotion_payment_links_superadmin_manage
  on public.promotion_payment_links
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and lower(trim(coalesce(profiles.role, ''))) in ('superadmin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and lower(trim(coalesce(profiles.role, ''))) in ('superadmin', 'super_admin')
    )
  );

grant select on public.promotion_payment_links to authenticated;
grant insert, update, delete on public.promotion_payment_links to authenticated;
