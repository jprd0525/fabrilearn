-- ForensiLearn — Postgres schema (PORTABLE) — v2
-- Fixes vs v1: tables live in `public` (where supabase-js + PostgREST expect them);
-- RLS is enabled inline (fail-closed) so there's no unprotected window; trigger uses
-- CREATE OR REPLACE (no destructive DROP). Auth-coupled helpers stay in `app`.
-- Run order: 1) schema.sql  2) policies.sql

create extension if not exists pgcrypto;        -- gen_random_uuid()
create schema if not exists app;

-- ── 0. Core tables (public schema = exposed to the API, protected by RLS) ────
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id     uuid not null,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  role        text not null default 'staff',          -- staff | manager | admin
  created_at  timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index if not exists memberships_tenant_idx on public.memberships(tenant_id);

create table if not exists public.entitlements (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,                           -- community | eventplanner | contests | improve ...
  enabled     boolean not null default true,
  primary key (tenant_id, feature_key)
);

-- ── 1. PORTABILITY SEAM — the only auth-coupled code ────────────────────────
--   Supabase: identity arrives in the JWT  -> current_setting('request.jwt.claims')
--   Self-host: the app sets it per session -> SET LOCAL app.user_id = '...'
create or replace function app.current_user_id() returns uuid
  language sql stable as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function app.current_tenant_id() returns uuid
  language sql stable as $$
  select coalesce(
    nullif(current_setting('app.tenant_id', true), '')::uuid,
    (select m.tenant_id from public.memberships m
       where m.user_id = app.current_user_id()
       order by m.created_at limit 1)
  );
$$;

-- ── 2. The generic store (one JSON doc per tenant+key) ──────────────────────
create table if not exists public.app_state (
  tenant_id   uuid not null default app.current_tenant_id() references public.tenants(id) on delete cascade,
  key         text not null,
  doc         jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (tenant_id, key)
);
create index if not exists app_state_tenant_idx on public.app_state(tenant_id);

create or replace function app.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := app.current_user_id();
  return new;
end; $$;

create or replace trigger app_state_touch before insert or update on public.app_state
  for each row execute function app.touch_updated_at();

-- ── 3. Enable RLS immediately (fail-closed until policies.sql adds policies) ──
alter table public.tenants      enable row level security;
alter table public.memberships  enable row level security;
alter table public.entitlements enable row level security;
alter table public.app_state    enable row level security;

-- ── 4. First-run seed (example) ─────────────────────────────────────────────
-- After creating an auth user (Authentication tab), run in the SQL editor
-- (which bypasses RLS as the service role):
--
--   insert into public.tenants (id, name) values ('00000000-0000-0000-0000-000000000001', 'Demo Lab');
--   insert into public.memberships (user_id, tenant_id, role)
--     values ('<auth-user-uuid>', '00000000-0000-0000-0000-000000000001', 'admin');
--   insert into public.entitlements (tenant_id, feature_key, enabled) values
--     ('00000000-0000-0000-0000-000000000001', 'community',    true),
--     ('00000000-0000-0000-0000-000000000001', 'eventplanner', true),
--     ('00000000-0000-0000-0000-000000000001', 'contests',     true),
--     ('00000000-0000-0000-0000-000000000001', 'improve',      true);
