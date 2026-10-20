create table if not exists public.billing_plan_payment_links (
  plan_code text primary key,
  payment_url text not null,
  updated_at timestamptz not null default now(),
  constraint billing_plan_payment_links_url_http
    check (payment_url ~* '^https?://')
);

alter table public.billing_plan_payment_links enable row level security;

drop policy if exists billing_plan_payment_links_authenticated_read
  on public.billing_plan_payment_links;
create policy billing_plan_payment_links_authenticated_read
  on public.billing_plan_payment_links
  for select
  to authenticated
  using (true);

drop policy if exists billing_plan_payment_links_superadmin_manage
  on public.billing_plan_payment_links;
create policy billing_plan_payment_links_superadmin_manage
  on public.billing_plan_payment_links
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and lower(trim(coalesce(profiles.role, ''))) in (
          'superadmin', 'super_admin'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and lower(trim(coalesce(profiles.role, ''))) in (
          'superadmin', 'super_admin'
        )
    )
  );

grant select on public.billing_plan_payment_links to authenticated;
grant insert, update, delete on public.billing_plan_payment_links to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'billing_plan_payment_links'
  ) then
    alter publication supabase_realtime
      add table public.billing_plan_payment_links;
  end if;
end;
$$;
