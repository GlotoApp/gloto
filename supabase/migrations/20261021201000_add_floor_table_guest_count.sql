alter table public.restaurant_floor_tables
  add column if not exists guest_count integer not null default 0
    check (guest_count between 0 and 12);
