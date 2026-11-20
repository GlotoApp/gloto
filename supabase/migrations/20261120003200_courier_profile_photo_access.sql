create or replace function public.get_my_courier_profile_photo_path()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select request.profile_photo_path
  from public.public_courier_application_requests as request
  where request.user_id = auth.uid()
  order by request.created_at desc
  limit 1
$$;

revoke all on function public.get_my_courier_profile_photo_path()
  from public, anon;
grant execute on function public.get_my_courier_profile_photo_path()
  to authenticated;

drop policy if exists "Couriers can view own profile photo"
  on storage.objects;
create policy "Couriers can view own profile photo"
on storage.objects
for select to authenticated
using (
  bucket_id = 'courier-application-documents'
  and name = public.get_my_courier_profile_photo_path()
);
