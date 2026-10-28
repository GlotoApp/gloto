-- Impresión inteligente por categoría
alter table public.categories
  add column if not exists printer_ip inet,
  add column if not exists printer_port integer not null default 9100;

alter table public.categories_shop
  add column if not exists printer_ip inet,
  add column if not exists printer_port integer not null default 9100;

alter table public.order_items
  add column if not exists category_id uuid,
  add column if not exists printing_status text not null default 'pending',
  add column if not exists printed_at timestamptz;

alter table public.order_items
  drop constraint if exists order_items_printing_status_check;
alter table public.order_items
  add constraint order_items_printing_status_check
  check (printing_status in ('pending', 'printing', 'printed', 'failed'));

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid not null,
  printer_ip inet not null,
  printer_port integer not null default 9100,
  category_ids uuid[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'printing', 'printed', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  printed_at timestamptz
);

create unique index if not exists print_jobs_order_printer_unique
  on public.print_jobs(order_id, printer_ip, printer_port);
create index if not exists print_jobs_pending_idx
  on public.print_jobs(status, created_at);

alter table public.print_jobs enable row level security;

create policy "servicios pueden administrar trabajos de impresión"
  on public.print_jobs for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "negocios pueden leer sus trabajos de impresión" on public.print_jobs;
create policy "negocios pueden leer sus trabajos de impresión"
  on public.print_jobs for select
  to authenticated
  using (business_id in (
    select business_id from public.profiles where id = auth.uid()
  ));

-- El agente accede mediante una clave pública anon y un token de tienda protegido por RLS.
