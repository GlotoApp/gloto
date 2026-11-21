create table if not exists public.business_courier_details (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  vehicle_type text not null check (vehicle_type in ('car', 'motorcycle')),
  document_paths jsonb not null check (jsonb_typeof(document_paths) = 'object'),
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

alter table public.business_courier_details enable row level security;

drop policy if exists business_courier_details_admin_select
  on public.business_courier_details;
create policy business_courier_details_admin_select
  on public.business_courier_details
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id = business_courier_details.business_id
    )
  );

drop policy if exists business_courier_details_admin_insert
  on public.business_courier_details;
create policy business_courier_details_admin_insert
  on public.business_courier_details
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id = business_courier_details.business_id
    )
    and exists (
      select 1
      from public.employees e
      where e.id = business_courier_details.employee_id
        and e.business_id = business_courier_details.business_id
        and lower(trim(coalesce(e.area, ''))) like '%domiciliario%'
    )
  );

drop policy if exists business_courier_details_admin_update
  on public.business_courier_details;
create policy business_courier_details_admin_update
  on public.business_courier_details
  for update to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id = business_courier_details.business_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id = business_courier_details.business_id
    )
    and exists (
      select 1
      from public.employees e
      where e.id = business_courier_details.employee_id
        and e.business_id = business_courier_details.business_id
        and lower(trim(coalesce(e.area, ''))) like '%domiciliario%'
    )
  );

drop policy if exists business_courier_details_admin_delete
  on public.business_courier_details;
create policy business_courier_details_admin_delete
  on public.business_courier_details
  for delete to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id = business_courier_details.business_id
    )
  );

grant select, insert, update, delete
  on public.business_courier_details
  to authenticated;

drop policy if exists business_admins_manage_courier_documents
  on storage.objects;
create policy business_admins_manage_courier_documents
  on storage.objects
  for all to authenticated
  using (
    bucket_id = 'courier-application-documents'
    and name ~ '^business/[0-9a-f-]{36}/[0-9a-f-]{36}/(license-front|license-back|vehicle-card-front|vehicle-card-back|identity-front|identity-back|profile-photo)\.(jpg|png|webp)$'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id::text = split_part(storage.objects.name, '/', 2)
    )
  )
  with check (
    bucket_id = 'courier-application-documents'
    and name ~ '^business/[0-9a-f-]{36}/[0-9a-f-]{36}/(license-front|license-back|vehicle-card-front|vehicle-card-back|identity-front|identity-back|profile-photo)\.(jpg|png|webp)$'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.business_id::text = split_part(storage.objects.name, '/', 2)
    )
  );
