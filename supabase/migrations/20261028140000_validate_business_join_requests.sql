create or replace function public.submit_business_join_request(
  p_business_name text,
  p_owner_name text,
  p_email text,
  p_phone text,
  p_city text,
  p_address text default '',
  p_business_type text default '',
  p_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if char_length(trim(coalesce(p_business_name, ''))) < 2 then
    raise exception 'El nombre del negocio debe tener al menos 2 caracteres.';
  end if;
  if char_length(trim(coalesce(p_owner_name, ''))) < 2 then
    raise exception 'El nombre del propietario debe tener al menos 2 caracteres.';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) < 7 then
    raise exception 'El teléfono debe tener al menos 7 caracteres.';
  end if;
  if char_length(trim(coalesce(p_description, ''))) < 10 then
    raise exception 'Cuéntanos sobre el negocio con al menos 10 caracteres.';
  end if;

  insert into public.business_join_requests (
    user_id, business_name, owner_name, email, phone, city, address, business_type, description
  ) values (
    auth.uid(), btrim(p_business_name), btrim(p_owner_name), lower(btrim(p_email)),
    btrim(p_phone), btrim(p_city), btrim(coalesce(p_address, '')), btrim(p_business_type),
    btrim(p_description)
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_business_join_request(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_business_join_request(text, text, text, text, text, text, text, text) to anon, authenticated;
