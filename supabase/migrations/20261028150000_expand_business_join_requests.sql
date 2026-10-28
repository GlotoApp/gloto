alter table public.business_join_requests
  add column if not exists neighborhood text not null default '',
  add column if not exists legal_name text not null default '',
  add column if not exists tax_id text not null default '',
  add column if not exists website text not null default '',
  add column if not exists opening_hours text not null default '',
  add column if not exists delivery_available boolean not null default false,
  add column if not exists delivery_zones text not null default '',
  add column if not exists estimated_products text not null default '',
  add column if not exists payment_methods text not null default '';

create or replace function public.submit_business_join_request(
  p_business_name text,
  p_owner_name text,
  p_email text,
  p_phone text,
  p_city text,
  p_address text default '',
  p_neighborhood text default '',
  p_business_type text default '',
  p_description text default '',
  p_legal_name text default '',
  p_tax_id text default '',
  p_website text default '',
  p_opening_hours text default '',
  p_delivery_available boolean default false,
  p_delivery_zones text default '',
  p_estimated_products text default '',
  p_payment_methods text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if char_length(btrim(coalesce(p_business_name, ''))) < 2 then raise exception 'Nombre de negocio inválido.'; end if;
  if char_length(btrim(coalesce(p_owner_name, ''))) < 2 then raise exception 'Nombre del propietario inválido.'; end if;
  if char_length(btrim(coalesce(p_phone, ''))) < 7 then raise exception 'Teléfono inválido.'; end if;
  if char_length(btrim(coalesce(p_address, ''))) < 3 then raise exception 'La dirección es obligatoria.'; end if;
  if char_length(btrim(coalesce(p_neighborhood, ''))) < 2 then raise exception 'El barrio es obligatorio.'; end if;
  if char_length(btrim(coalesce(p_opening_hours, ''))) < 5 then raise exception 'El horario es obligatorio.'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 10 then raise exception 'La descripción debe tener al menos 10 caracteres.'; end if;

  insert into public.business_join_requests (
    user_id, business_name, owner_name, email, phone, city, address, neighborhood,
    business_type, description, legal_name, tax_id, website, opening_hours,
    delivery_available, delivery_zones, estimated_products, payment_methods
  ) values (
    auth.uid(), btrim(p_business_name), btrim(p_owner_name), lower(btrim(p_email)), btrim(p_phone),
    btrim(p_city), btrim(p_address), btrim(p_neighborhood), btrim(p_business_type), btrim(p_description),
    btrim(coalesce(p_legal_name, '')), btrim(coalesce(p_tax_id, '')), btrim(coalesce(p_website, '')), btrim(p_opening_hours),
    coalesce(p_delivery_available, false), btrim(coalesce(p_delivery_zones, '')),
    btrim(coalesce(p_estimated_products, '')), btrim(coalesce(p_payment_methods, ''))
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_business_join_request(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text) from public;
grant execute on function public.submit_business_join_request(text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text) to anon, authenticated;
