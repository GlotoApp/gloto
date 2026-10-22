alter table public.restaurant_floor_tables
  drop constraint if exists restaurant_floor_tables_shape_check;

alter table public.restaurant_floor_tables
  add constraint restaurant_floor_tables_shape_check
  check (shape in ('round', 'square', 'rectangle'));
