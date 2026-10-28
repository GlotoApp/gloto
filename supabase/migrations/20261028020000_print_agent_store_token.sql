-- Autenticación pública del agente mediante token de tienda + RLS.
-- Nunca almacena ni distribuye la service_role key.
alter table public.businesses add column if not exists printing_agent_token text;

create table if not exists public.printing_agents (
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_uuid uuid not null,
  name text not null default 'PC impresión Gloto',
  status text not null default 'offline' check (status in ('offline', 'online')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, device_uuid)
);

alter table public.printing_agents enable row level security;

create or replace function public.request_print_store_token()
returns text
language sql stable
set search_path = public
as $$
  select coalesce((coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-gloto-store-token'), '')
$$;

create or replace function public.print_agent_business_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select b.id
  from public.businesses b
  where b.printing_agent_token is not null
    and b.printing_agent_token = public.request_print_store_token()
  limit 1
$$;

create or replace function public.rotate_printing_agent_token(p_business_id uuid default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_profile record;
  v_business_id uuid;
  v_role text;
  v_token text;
begin
  select p.business_id, lower(trim(coalesce(p.role, ''))) as role
  into v_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  v_role := coalesce(v_profile.role, '');
  if v_role not in ('admin', 'owner', 'super_admin', 'superadmin', 'administrador', 'propietario') then
    raise exception 'Solo administradores pueden generar el token';
  end if;

  if v_role in ('super_admin', 'superadmin') then
    if p_business_id is null then
      raise exception 'El super administrador debe indicar la tienda';
    end if;
    v_business_id := p_business_id;
  else
    v_business_id := v_profile.business_id;
    if p_business_id is not null and p_business_id <> v_business_id then
      raise exception 'La tienda solicitada no pertenece al usuario';
    end if;
  end if;

  if v_business_id is null then
    raise exception 'No se encontró la tienda del usuario';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.businesses set printing_agent_token = v_token
  where id = v_business_id;
  if not found then raise exception 'La tienda no existe'; end if;
  return v_token;
end;
$$;

revoke execute on function public.rotate_printing_agent_token(uuid) from anon;
grant execute on function public.rotate_printing_agent_token(uuid) to authenticated;

create or replace function public.get_printing_agent_config(p_business_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_profile record;
  v_business_id uuid;
  v_role text;
  v_token text;
begin
  select p.business_id, lower(trim(coalesce(p.role, ''))) as role
  into v_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  v_role := coalesce(v_profile.role, '');
  if v_role not in ('admin', 'owner', 'super_admin', 'superadmin', 'administrador', 'propietario') then
    return null;
  end if;

  if p_business_id is not null and v_role in ('super_admin', 'superadmin') then
    v_business_id := p_business_id;
  elsif p_business_id is not null and v_profile.business_id = p_business_id then
    v_business_id := p_business_id;
  elsif p_business_id is null then
    v_business_id := v_profile.business_id;
  else
    return null;
  end if;

  select b.printing_agent_token into v_token
  from public.businesses b where b.id = v_business_id;

  if v_business_id is null then return null; end if;
  return jsonb_build_object('business_id', v_business_id, 'store_token', v_token);
end;
$$;

revoke execute on function public.get_printing_agent_config(uuid) from anon;
grant execute on function public.get_printing_agent_config(uuid) to authenticated;
grant execute on function public.get_printing_agent_config() to authenticated;

-- Los agentes sólo pueden operar sobre su negocio identificado por el token.
-- Las políticas se crean sólo si las migraciones anteriores ya definieron las tablas.
do $$
begin
  if to_regclass('public.print_jobs') is not null then
    execute 'drop policy if exists "agente imprime en su tienda" on public.print_jobs';
    execute 'create policy "agente imprime en su tienda" on public.print_jobs for all to anon using (business_id = public.print_agent_business_id()) with check (business_id = public.print_agent_business_id())';
  else
    raise warning 'Instala primero 20261028000000_smart_category_printing.sql; aún no existe public.print_jobs.';
  end if;

  if to_regclass('public.network_printers') is not null then
    execute 'drop policy if exists "agente consulta sus impresoras" on public.network_printers';
    execute 'create policy "agente consulta sus impresoras" on public.network_printers for select to anon using (business_id = public.print_agent_business_id())';
  else
    raise warning 'Instala primero 20261028010000_add_network_printers.sql; aún no existe public.network_printers.';
  end if;

  if to_regclass('public.categories_shop') is not null then
    execute 'drop policy if exists "agente consulta categorías de su tienda" on public.categories_shop';
    execute 'create policy "agente consulta categorías de su tienda" on public.categories_shop for select to anon using (business_id = public.print_agent_business_id())';
  end if;

  if to_regclass('public.orders') is not null then
    execute 'drop policy if exists "agente consulta pedidos de su tienda" on public.orders';
    execute 'create policy "agente consulta pedidos de su tienda" on public.orders for select to anon using (business_id = public.print_agent_business_id())';
  end if;

  if to_regclass('public.order_items') is not null and to_regclass('public.orders') is not null then
    execute 'drop policy if exists "agente consulta items de su tienda" on public.order_items';
    execute 'create policy "agente consulta items de su tienda" on public.order_items for select to anon using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.business_id = public.print_agent_business_id()))';
  end if;

  if to_regclass('public.printing_agents') is not null then
    execute 'drop policy if exists "agente registra su equipo" on public.printing_agents';
    execute 'create policy "agente registra su equipo" on public.printing_agents for all to anon using (business_id = public.print_agent_business_id()) with check (business_id = public.print_agent_business_id())';
  end if;
end
$$;
