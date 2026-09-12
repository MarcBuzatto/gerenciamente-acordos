-- =============================================================================
-- Bootstrap SOMENTE PARA TESTE LOCAL.
--
-- Não é uma migração e nunca é aplicado num projeto Supabase: recria, num
-- PostgreSQL comum, a parte da plataforma de que as migrações dependem —
-- os papéis `anon`/`authenticated`/`service_role`, o schema `auth` com
-- `auth.users`, e as funções `auth.uid()` / `auth.jwt()` que leem as claims do
-- JWT a partir da GUC `request.jwt.claims`, exatamente como o PostgREST faz.
--
-- Assim os mesmos arquivos de migração que vão para a homologação podem ser
-- testados aqui, sem Docker e sem rede.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant anon, authenticated, service_role to current_user;

-- IMPORTANTE — replica os privilégios PADRÃO do Supabase.
--
-- Num projeto Supabase, o schema `public` vem com ALTER DEFAULT PRIVILEGES
-- concedendo TUDO a `anon`, `authenticated` e `service_role` em tabelas,
-- funções e sequências. Ou seja: toda tabela nasce aberta, e é o REVOKE da
-- migração 0003 que a fecha.
--
-- Sem reproduzir isso aqui, os REVOKE das migrações seriam no-ops no teste
-- local e passariam despercebidos — enquanto no projeto real as tabelas
-- ficariam abertas. Com esta reprodução, o teste exerce o mesmo cenário.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
-- As funções SECURITY DEFINER consultam auth.users para e-mail e metadados.
grant select on auth.users to service_role;
