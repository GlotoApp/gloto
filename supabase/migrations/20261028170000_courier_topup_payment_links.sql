create table if not exists public.courier_topup_payment_links (
  amount integer primary key,
  payment_url text not null,
  updated_at timestamptz not null default now(),
  constraint courier_topup_payment_links_amount_check
    check (amount in (5000, 10000, 20000, 30000, 40000, 50000)),
  constraint courier_topup_payment_links_url_check
    check (payment_url ~* '^https?://')
);

alter table public.courier_topup_payment_links
  drop constraint if exists courier_topup_payment_links_amount_check;
alter table public.courier_topup_payment_links
  add constraint courier_topup_payment_links_amount_check
  check (amount in (5000, 10000, 20000, 30000, 40000, 50000));

alter table public.courier_topup_payment_links enable row level security;

drop policy if exists courier_topup_payment_links_authenticated_read
  on public.courier_topup_payment_links;
create policy courier_topup_payment_links_authenticated_read
  on public.courier_topup_payment_links
  for select to authenticated
  using (true);

drop policy if exists courier_topup_payment_links_superadmin_manage
  on public.courier_topup_payment_links;
create policy courier_topup_payment_links_superadmin_manage
  on public.courier_topup_payment_links
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

grant select on public.courier_topup_payment_links to authenticated;
grant insert, update, delete on public.courier_topup_payment_links to authenticated;
