alter table public.product_option_groups
  add column if not exists parent_item_id uuid
    references public.products_items(id) on delete cascade,
  add column if not exists min_selections integer not null default 0
    check (min_selections >= 0),
  add column if not exists price_mode text not null default 'sum'
    check (price_mode in ('sum', 'highest')),
  add column if not exists max_extra_price numeric
    check (max_extra_price is null or max_extra_price >= 0);

update public.product_option_groups
set min_selections = 1
where is_required = true and min_selections = 0;

create index if not exists product_option_groups_parent_item_id_idx
  on public.product_option_groups(parent_item_id);
