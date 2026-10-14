drop policy if exists superadmin_manage_business_info
  on public.business_info;
create policy superadmin_manage_business_info
  on public.business_info
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'superadmin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'superadmin'
    )
  );

drop policy if exists superadmin_manage_categories_shop
  on public.categories_shop;
create policy superadmin_manage_categories_shop
  on public.categories_shop
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'superadmin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'superadmin'
    )
  );
