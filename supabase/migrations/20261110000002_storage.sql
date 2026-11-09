-- Storage buckets (public read, JPEG only) + policies

insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values
  ('templates', 'templates', true, array['image/jpeg'], 31457280),  -- 30 MB
  ('creations', 'creations', true, array['image/jpeg'], 31457280)
on conflict (id) do update
  set public             = excluded.public,
      allowed_mime_types = excluded.allowed_mime_types,
      file_size_limit    = excluded.file_size_limit;

-- Read: both buckets
drop policy if exists "tc: read templates+creations" on storage.objects;
create policy "tc: read templates+creations" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('templates', 'creations'));

-- Insert: templates (full/ and thumbs/ folders, .jpg only)
drop policy if exists "tc: upload templates" on storage.objects;
create policy "tc: upload templates" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'templates'
    and (storage.foldername(name))[1] in ('full', 'thumbs')
    and lower(storage.extension(name)) = 'jpg'
  );

-- Insert: creations (.jpg only)
drop policy if exists "tc: upload creations" on storage.objects;
create policy "tc: upload creations" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'creations'
    and lower(storage.extension(name)) = 'jpg'
  );

-- Delete: only template files that belong to an *uploaded* template.
-- There is deliberately NO anon delete on `creations`; the cleanup-creations function does that.
drop policy if exists "tc: delete uploaded templates" on storage.objects;
create policy "tc: delete uploaded templates" on storage.objects
  for delete to anon, authenticated
  using (
    bucket_id = 'templates'
    and exists (
      select 1 from public.templates t
      where t.source = 'upload'
        and (t.full_path = storage.objects.name or t.thumb_path = storage.objects.name)
    )
  );
