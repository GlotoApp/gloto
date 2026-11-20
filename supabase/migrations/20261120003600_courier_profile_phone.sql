create or replace function public.set_my_courier_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := btrim(coalesce(p_phone, ''));
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para actualizar tu teléfono.';
  end if;

  if char_length(v_phone) < 7 or char_length(v_phone) > 30 then
    raise exception 'El teléfono debe tener entre 7 y 30 caracteres.';
  end if;

  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('phone', v_phone)
  where id = auth.uid();

  if not found then
    raise exception 'No se encontró la cuenta del domiciliario.';
  end if;

  update public.public_courier_applications
  set phone = v_phone
  where user_id = auth.uid();

  return v_phone;
end;
$$;

revoke all on function public.set_my_courier_phone(text)
  from public, anon;
grant execute on function public.set_my_courier_phone(text)
  to authenticated;

revoke all on function public.set_my_courier_profile_name(text)
  from public, anon, authenticated;
