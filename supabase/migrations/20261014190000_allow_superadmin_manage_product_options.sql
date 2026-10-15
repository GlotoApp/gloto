drop policy if exists superadmin_manage_product_option_groups
  on public.product_option_groups;
create policy superadmin_manage_product_option_groups
  on public.product_option_groups
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

drop policy if exists superadmin_manage_products_items
  on public.products_items;
create policy superadmin_manage_products_items
  on public.products_items
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
