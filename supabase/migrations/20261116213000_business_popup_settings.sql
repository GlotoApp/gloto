create table if not exists public.business_popup_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  show_widget boolean not null default true,
  notify_marketplace_orders boolean not null default true,
  notify_pos_orders boolean not null default false,
  sound_enabled boolean not null default true,
  color text not null default 'violet'
    check (color in ('violet', 'blue', 'emerald', 'amber', 'rose')),
  updated_at timestamptz not null default now()
);

alter table public.business_popup_settings enable row level security;

drop policy if exists business_popup_settings_business_access
  on public.business_popup_settings;
create policy business_popup_settings_business_access
  on public.business_popup_settings
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.business_id = business_popup_settings.business_id
          or p.role in ('superadmin', 'super_admin')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.business_id = business_popup_settings.business_id
          or p.role in ('superadmin', 'super_admin')
        )
    )
  );

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_popup_settings'
  ) then
    alter publication supabase_realtime
      add table public.business_popup_settings;
  end if;
end $$;
