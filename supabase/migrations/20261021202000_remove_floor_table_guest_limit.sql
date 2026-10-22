alter table public.restaurant_floor_tables
  drop constraint if exists restaurant_floor_tables_guest_count_check;

alter table public.restaurant_floor_tables
  alter column guest_count type numeric using guest_count::numeric;

alter table public.restaurant_floor_tables
  add constraint restaurant_floor_tables_guest_count_check
  check (guest_count >= 0 and guest_count = trunc(guest_count));
