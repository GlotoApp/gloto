drop policy if exists superadmin_manage_business_assets
  on storage.objects;

create policy superadmin_manage_business_assets
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'business-assets'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'superadmin'
    )
  )
  with check (
    bucket_id = 'business-assets'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'superadmin'
    )
  );
