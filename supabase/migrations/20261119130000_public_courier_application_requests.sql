create table if not exists public.public_courier_application_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 3 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null check (char_length(trim(phone)) between 7 and 30),
  vehicle_type text not null check (vehicle_type in ('car', 'motorcycle')),
  license_front_path text not null,
  license_back_path text not null,
  vehicle_card_front_path text not null,
  vehicle_card_back_path text not null,
  identity_front_path text not null,
  identity_back_path text not null,
  profile_photo_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_courier_application_requests_status_created_idx
  on public.public_courier_application_requests(status, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-application-documents',
  'courier-application-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.submit_public_courier_application_request(
  p_full_name text,
  p_email text,
  p_phone text,
  p_vehicle_type text,
  p_license_front_path text,
  p_license_back_path text,
  p_vehicle_card_front_path text,
  p_vehicle_card_back_path text,
  p_identity_front_path text,
  p_identity_back_path text,
  p_profile_photo_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if lower(trim(p_vehicle_type)) not in ('car', 'motorcycle') then
    raise exception 'El tipo de vehículo no es válido.';
  end if;

  insert into public.public_courier_application_requests (
    user_id,
    full_name,
    email,
    phone,
    vehicle_type,
    license_front_path,
    license_back_path,
    vehicle_card_front_path,
    vehicle_card_back_path,
    identity_front_path,
    identity_back_path,
    profile_photo_path
  )
  values (
    auth.uid(),
    btrim(p_full_name),
    lower(btrim(p_email)),
    btrim(p_phone),
    lower(trim(p_vehicle_type)),
    p_license_front_path,
    p_license_back_path,
    p_vehicle_card_front_path,
    p_vehicle_card_back_path,
    p_identity_front_path,
    p_identity_back_path,
    p_profile_photo_path
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_public_courier_application_request(
  text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.submit_public_courier_application_request(
  text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

alter table public.public_courier_application_requests enable row level security;

drop policy if exists "Superadmins can view courier application requests"
  on public.public_courier_application_requests;
create policy "Superadmins can view courier application requests"
on public.public_courier_application_requests
for select to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(profiles.role) in ('superadmin', 'super_admin')
  )
);

drop policy if exists "Superadmins can review courier application requests"
  on public.public_courier_application_requests;
create policy "Superadmins can review courier application requests"
on public.public_courier_application_requests
for update to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(profiles.role) in ('superadmin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(profiles.role) in ('superadmin', 'super_admin')
  )
);

drop policy if exists "Anyone can upload courier application documents"
  on storage.objects;
create policy "Anyone can upload courier application documents"
on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'courier-application-documents'
  and name ~ '^pending/[a-z0-9-]+/(license-front|license-back|vehicle-card-front|vehicle-card-back|identity-front|identity-back|profile-photo)\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "Superadmins can view courier application documents"
  on storage.objects;
create policy "Superadmins can view courier application documents"
on storage.objects
for select to authenticated
using (
  bucket_id = 'courier-application-documents'
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(profiles.role) in ('superadmin', 'super_admin')
  )
);

drop policy if exists "Superadmins can delete courier application documents"
  on storage.objects;
create policy "Superadmins can delete courier application documents"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'courier-application-documents'
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(profiles.role) in ('superadmin', 'super_admin')
  )
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'public_courier_application_requests'
  ) then
    alter publication supabase_realtime
      add table public.public_courier_application_requests;
  end if;
end;
$$;
