-- Registro de impresoras de red por negocio
create table if not exists public.network_printers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  ip_address inet not null,
  port integer not null default 9100 check (port between 1 and 65535),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  unique (business_id, ip_address, port)
);

alter table public.categories_shop
  add column if not exists printer_id uuid references public.network_printers(id) on delete set null;

alter table public.network_printers enable row level security;

drop policy if exists "negocios administran sus impresoras" on public.network_printers;
create policy "negocios administran sus impresoras"
  on public.network_printers for all
  to authenticated
  using (business_id in (select business_id from public.profiles where id = auth.uid()))
  with check (business_id in (select business_id from public.profiles where id = auth.uid()));

drop policy if exists "servicios administran impresoras" on public.network_printers;
create policy "servicios administran impresoras"
  on public.network_printers for all
  to service_role
  using (true)
  with check (true);
