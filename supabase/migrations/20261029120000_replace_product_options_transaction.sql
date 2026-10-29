create or replace function public.replace_product_options_for_item(
  p_product_id uuid,
  p_parent_item_id uuid,
  p_groups jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  saved_group_id uuid;
  saved_item_id uuid;
  group_json jsonb;
  item_json jsonb;
  group_index integer := 0;
  item_index integer;
begin
  for group_json in
    select value from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb))
  loop
    if coalesce(nullif(trim(group_json->>'name'), ''), '') = '' then
      continue;
    end if;

    group_index := group_index + 1;
    insert into public.product_option_groups (
      product_id,
      parent_item_id,
      name,
      description,
      is_required,
      selection_type,
      min_selections,
      max_selections,
      price_mode,
      max_extra_price,
      order_index
    )
    values (
      p_product_id,
      p_parent_item_id,
      btrim(group_json->>'name'),
      nullif(btrim(group_json->>'description'), ''),
      coalesce((group_json->>'is_required')::boolean, false),
      coalesce(nullif(group_json->>'selection_type', ''), 'single'),
      coalesce((group_json->>'min_selections')::integer, 0),
      case
        when group_json->>'selection_type' = 'multiple'
          then nullif(group_json->>'max_selections', '')::integer
        else null
      end,
      coalesce(nullif(group_json->>'price_mode', ''), 'sum'),
      nullif(group_json->>'max_extra_price', '')::numeric,
      coalesce((group_json->>'order_index')::integer, group_index)
    )
    returning id into saved_group_id;

    item_index := 0;
    for item_json in
      select value
      from jsonb_array_elements(coalesce(group_json->'items', '[]'::jsonb))
    loop
      if coalesce(nullif(trim(item_json->>'nombre'), ''), '') = '' then
        continue;
      end if;

      item_index := item_index + 1;
      insert into public.products_items (
        product_id,
        option_group_id,
        nombre,
        precio_extra,
        order_index
      )
      values (
        p_product_id,
        saved_group_id,
        btrim(item_json->>'nombre'),
        coalesce((item_json->>'precio_extra')::numeric, 0),
        coalesce((item_json->>'order_index')::integer, item_index)
      )
      returning id into saved_item_id;

      if coalesce(jsonb_array_length(item_json->'childGroups'), 0) > 0 then
        perform public.replace_product_options_for_item(
          p_product_id,
          saved_item_id,
          item_json->'childGroups'
        );
      end if;
    end loop;
  end loop;
end;
$function$;

create or replace function public.replace_product_options(
  p_product_id uuid,
  p_groups jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  saved_group_id uuid;
  saved_item_id uuid;
  group_json jsonb;
  item_json jsonb;
  group_index integer := 0;
  item_index integer;
  product_business_id uuid;
  profile_business_id uuid;
  profile_role text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para guardar opciones.';
  end if;

  if p_groups is null or jsonb_typeof(p_groups) <> 'array' then
    raise exception 'p_groups debe ser un arreglo';
  end if;

  select products.business_id
  into product_business_id
  from public.products
  where products.id = p_product_id;

  if not found then
    raise exception 'Producto no encontrado.';
  end if;

  select profiles.business_id, lower(trim(coalesce(profiles.role, '')))
  into profile_business_id, profile_role
  from public.profiles
  where profiles.id = auth.uid();

  if profile_role not in ('superadmin', 'super_admin')
    and (profile_business_id is null or profile_business_id <> product_business_id) then
    raise exception 'No tienes permiso para modificar las opciones de este producto.';
  end if;

  delete from public.product_option_groups
  where product_id = p_product_id;

  delete from public.products_items
  where product_id = p_product_id;

  for group_json in
    select value from jsonb_array_elements(p_groups)
  loop
    if coalesce(nullif(trim(group_json->>'name'), ''), '') = '' then
      continue;
    end if;

    group_index := group_index + 1;
    insert into public.product_option_groups (
      product_id,
      parent_item_id,
      name,
      description,
      is_required,
      selection_type,
      min_selections,
      max_selections,
      price_mode,
      max_extra_price,
      order_index
    )
    values (
      p_product_id,
      null,
      btrim(group_json->>'name'),
      nullif(btrim(group_json->>'description'), ''),
      coalesce((group_json->>'is_required')::boolean, false),
      coalesce(nullif(group_json->>'selection_type', ''), 'single'),
      coalesce((group_json->>'min_selections')::integer, 0),
      case
        when group_json->>'selection_type' = 'multiple'
          then nullif(group_json->>'max_selections', '')::integer
        else null
      end,
      coalesce(nullif(group_json->>'price_mode', ''), 'sum'),
      nullif(group_json->>'max_extra_price', '')::numeric,
      coalesce((group_json->>'order_index')::integer, group_index)
    )
    returning id into saved_group_id;

    item_index := 0;
    for item_json in
      select value
      from jsonb_array_elements(coalesce(group_json->'items', '[]'::jsonb))
    loop
      if coalesce(nullif(trim(item_json->>'nombre'), ''), '') = '' then
        continue;
      end if;

      item_index := item_index + 1;
      insert into public.products_items (
        product_id,
        option_group_id,
        nombre,
        precio_extra,
        order_index
      )
      values (
        p_product_id,
        saved_group_id,
        btrim(item_json->>'nombre'),
        coalesce((item_json->>'precio_extra')::numeric, 0),
        coalesce((item_json->>'order_index')::integer, item_index)
      )
      returning id into saved_item_id;

      if coalesce(jsonb_array_length(item_json->'childGroups'), 0) > 0 then
        perform public.replace_product_options_for_item(
          p_product_id,
          saved_item_id,
          item_json->'childGroups'
        );
      end if;
    end loop;
  end loop;
end;
$function$;

revoke all on function public.replace_product_options(uuid, jsonb) from public;
grant execute on function public.replace_product_options(uuid, jsonb) to authenticated;

revoke all on function public.replace_product_options_for_item(uuid, uuid, jsonb) from public;
