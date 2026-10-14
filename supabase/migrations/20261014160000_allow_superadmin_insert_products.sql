drop policy if exists superadmin_insert_products on public.products;

create policy superadmin_insert_products
  on public.products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'superadmin'
    )
  );
