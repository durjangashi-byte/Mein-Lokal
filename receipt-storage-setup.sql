-- Deploy together with receipts.js. Private receipts follow existing Lokal owner authorization.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('lokal-receipts','lokal-receipts',false,10485760,array['image/jpeg'])
on conflict (id) do nothing;

create policy lokal_receipt_read on storage.objects for select to authenticated
using (
 bucket_id='lokal-receipts'
 and (select auth.jwt()->'app_metadata'->>'lokal_access')='owner'
 and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'
 and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy lokal_receipt_insert on storage.objects for insert to authenticated
with check (
 bucket_id='lokal-receipts'
 and (select auth.jwt()->'app_metadata'->>'lokal_access')='owner'
 and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(name),1)=2
 and exists (select 1 from public.ausgaben a where a.id::text=(storage.foldername(name))[2])
 and lower(storage.extension(name))='jpg'
);
-- No public URLs, UPDATE, DELETE or privileged client key.
