alter table public.business_info
  add column if not exists payment_methods text[]
  not null default array['Efectivo', 'Tarjeta', 'Transferencia']::text[];

update public.business_info
set payment_methods = array['Efectivo', 'Tarjeta', 'Transferencia']::text[]
where payment_methods is null
   or cardinality(payment_methods) = 0;
