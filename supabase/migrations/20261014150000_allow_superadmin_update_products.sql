drop policy if exists superadmin_update_products on public.products;

create policy superadmin_update_products
  on public.products
  for update
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
