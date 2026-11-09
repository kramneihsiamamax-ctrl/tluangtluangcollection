-- Allow deleting ANY template (seed templates too), not only uploaded ones.
-- Requested by the shop owner on 2026-11-10.
-- The app deletes the row first, then its two files (full/ and thumbs/).

drop policy if exists "templates: delete uploads" on public.templates;
drop policy if exists "templates: delete" on public.templates;
create policy "templates: delete" on public.templates
  for delete to anon, authenticated using (true);

drop policy if exists "tc: delete uploaded templates" on storage.objects;
drop policy if exists "tc: delete templates" on storage.objects;
create policy "tc: delete templates" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'templates');
