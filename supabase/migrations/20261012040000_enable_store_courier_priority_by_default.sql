alter table public.employees
  alter column store_order_priority_enabled set default true;

update public.employees
set store_order_priority_enabled = true
where lower(trim(coalesce(area, ''))) like '%domiciliario%'
  and store_order_priority_enabled = false;
