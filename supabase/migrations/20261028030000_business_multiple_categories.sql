alter table public.business_info
  add column if not exists category_ids uuid[] not null default '{}';

update public.business_info
set category_ids = case
  when category_id is null then '{}'::uuid[]
  else array[category_id]
end
where category_ids = '{}'::uuid[];

create index if not exists business_info_category_ids_gin_idx
  on public.business_info using gin (category_ids);
