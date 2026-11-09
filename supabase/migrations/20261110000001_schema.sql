-- TluangTluang Collection — tables + RLS
-- There is no login: the anon role is the app user. Anyone holding the app URL can upload.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- templates
create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  full_path   text not null,
  thumb_path  text not null,
  width       int,
  height      int,
  source      text check (source in ('seed', 'upload')) default 'upload',
  sort_order  int default 0,
  created_at  timestamptz default now()
);
create unique index if not exists templates_full_path_key on public.templates (full_path);
create index if not exists templates_sort_idx on public.templates (sort_order, created_at);

-- ---------------------------------------------------------------- creations
create table if not exists public.creations (
  id            uuid primary key default gen_random_uuid(),
  kind          text check (kind in ('original', 'export')),
  storage_path  text not null,
  ratio         text,
  template_id   uuid references public.templates (id) on delete set null,
  created_at    timestamptz default now()
);
create index if not exists creations_created_idx on public.creations (created_at desc);
create index if not exists creations_kind_created_idx on public.creations (kind, created_at desc);

-- ---------------------------------------------------------------- settings
create table if not exists public.settings (
  id                   int primary key default 1 check (id = 1),
  watermark            jsonb not null default '{}',
  default_template_id  uuid,
  updated_at           timestamptz default now()
);

-- The single settings row must exist (anon may update it, not insert it).
insert into public.settings (id, watermark)
values (
  1,
  '{"enabled": true, "position": 8, "opacity": 0.6, "size": "M", "variant": "dark", "applyAll": true, "jpegQuality": 0.95}'::jsonb
)
on conflict (id) do nothing;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.updated_at := now();
  return new;
end
$fn$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.templates enable row level security;
alter table public.creations enable row level security;
alter table public.settings  enable row level security;

-- Grants: exactly what the app needs.
revoke all on public.templates, public.creations, public.settings from anon, authenticated;
grant select, insert, delete on public.templates to anon, authenticated;
grant select, insert         on public.creations to anon, authenticated;
grant select, update         on public.settings  to anon, authenticated;

-- templates
drop policy if exists "templates: read" on public.templates;
create policy "templates: read" on public.templates
  for select to anon, authenticated using (true);

drop policy if exists "templates: insert uploads" on public.templates;
create policy "templates: insert uploads" on public.templates
  for insert to anon, authenticated with check (source = 'upload');

drop policy if exists "templates: delete uploads" on public.templates;
create policy "templates: delete uploads" on public.templates
  for delete to anon, authenticated using (source = 'upload');

-- creations
drop policy if exists "creations: read" on public.creations;
create policy "creations: read" on public.creations
  for select to anon, authenticated using (true);

drop policy if exists "creations: insert" on public.creations;
create policy "creations: insert" on public.creations
  for insert to anon, authenticated with check (kind in ('original', 'export'));

-- settings
drop policy if exists "settings: read" on public.settings;
create policy "settings: read" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "settings: update" on public.settings;
create policy "settings: update" on public.settings
  for update to anon, authenticated using (id = 1) with check (id = 1);
