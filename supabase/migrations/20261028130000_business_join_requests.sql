create table if not exists public.business_join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  business_name text not null check (char_length(trim(business_name)) between 2 and 120),
  owner_name text not null check (char_length(trim(owner_name)) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null check (char_length(trim(phone)) between 7 and 30),
  city text not null check (char_length(trim(city)) between 2 and 80),
  address text not null default '',
  business_type text not null check (char_length(trim(business_type)) between 2 and 80),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_join_requests_status_created_idx
  on public.business_join_requests(status, created_at desc);

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

alter table public.business_join_requests enable row level security;

create policy "Superadmins can view business join requests"
on public.business_join_requests for select to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('superadmin', 'super_admin')));

create policy "Superadmins can review business join requests"
on public.business_join_requests for update to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('superadmin', 'super_admin')))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('superadmin', 'super_admin')));

alter publication supabase_realtime add table public.business_join_requests;
