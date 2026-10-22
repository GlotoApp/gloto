create table if not exists public.restaurant_floor_areas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default 'Mesas'
    check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index if not exists restaurant_floor_areas_business_name_key
  on public.restaurant_floor_areas (business_id, lower(name));

create table if not exists public.restaurant_floor_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  area_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  position_x numeric(5, 2) not null default 50
    check (position_x between 0 and 100),
  position_y numeric(5, 2) not null default 50
    check (position_y between 0 and 100),
  shape text not null default 'round'
    check (shape in ('round', 'square')),
  created_at timestamptz not null default now(),
  constraint restaurant_floor_tables_area_business_fkey
    foreign key (area_id, business_id)
    references public.restaurant_floor_areas (id, business_id)
    on delete cascade,
  constraint restaurant_floor_tables_business_label_key
    unique (business_id, label)
);

create index if not exists restaurant_floor_tables_area_position_idx
  on public.restaurant_floor_tables (area_id, position_y, position_x);

alter table public.restaurant_floor_areas enable row level security;
alter table public.restaurant_floor_tables enable row level security;

drop policy if exists restaurant_floor_areas_business_access
  on public.restaurant_floor_areas;
create policy restaurant_floor_areas_business_access
  on public.restaurant_floor_areas
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.business_id = restaurant_floor_areas.business_id
          or p.role = 'superadmin'
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.business_id = restaurant_floor_areas.business_id
          or p.role = 'superadmin'
        )
    )
  );

drop policy if exists restaurant_floor_tables_business_access
  on public.restaurant_floor_tables;
create policy restaurant_floor_tables_business_access
  on public.restaurant_floor_tables
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.business_id = restaurant_floor_tables.business_id
          or p.role = 'superadmin'
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.business_id = restaurant_floor_tables.business_id
          or p.role = 'superadmin'
        )
    )
  );

grant select, insert, update, delete
  on public.restaurant_floor_areas, public.restaurant_floor_tables
  to authenticated;
