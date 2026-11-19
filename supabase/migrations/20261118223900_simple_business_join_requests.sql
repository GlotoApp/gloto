alter table public.business_join_requests
  add column if not exists role text not null default '';

create or replace function public.submit_business_join_request(
  p_full_name text,
  p_phone text,
  p_business_name text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_business_name text := btrim(coalesce(p_business_name, ''));
  v_role text := btrim(coalesce(p_role, ''));
begin
  if char_length(v_full_name) < 3 then
    raise exception 'El nombre completo debe tener al menos 3 caracteres.';
  end if;
  if char_length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    raise exception 'El teléfono debe tener al menos 7 números.';
  end if;
  if char_length(v_business_name) < 2 then
    raise exception 'El nombre del negocio debe tener al menos 2 caracteres.';
  end if;
  if char_length(v_role) < 2 then
    raise exception 'Selecciona cuál es tu rol.';
  end if;

  insert into public.business_join_requests (
    user_id,
    business_name,
    owner_name,
    email,
    phone,
    city,
    address,
    neighborhood,
    business_type,
    description,
    opening_hours,
    delivery_available,
    estimated_products,
    role
  ) values (
    auth.uid(),
    v_business_name,
    v_full_name,
    'sin-correo@gloto.local',
    v_phone,
    'No indicada',
    '',
    '',
    'Por definir',
    'Solicitud rápida enviada desde la landing de Gloto.',
    '',
    false,
    '',
    v_role
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_business_join_request(text, text, text, text) from public;
grant execute on function public.submit_business_join_request(text, text, text, text) to anon, authenticated;
