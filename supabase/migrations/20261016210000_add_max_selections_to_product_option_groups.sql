alter table public.product_option_groups
  add column if not exists max_selections integer
  check (max_selections is null or max_selections >= 1);
