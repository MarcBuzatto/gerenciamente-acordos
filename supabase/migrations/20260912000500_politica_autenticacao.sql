-- =============================================================================
-- 0005 — Nível de autenticação exigido, por ambiente
--
-- POR QUE ISTO EXISTE
--
-- Todo acesso a dado de operação exige `aal2` — sessão que passou pela
-- verificação em duas etapas. Só que a verificação em duas etapas do Supabase
-- é recurso de plano pago (o próprio template de `config.toml` da CLI diz
-- "Multi-factor-authentication is available to Supabase Pro plan"). Num projeto
-- de homologação no plano gratuito, ninguém consegue cadastrar o segundo fator
-- e, com a exigência fixa, ninguém alcança dado nenhum: o ambiente fica
-- impossível de validar.
--
-- A saída NÃO é afrouxar a regra no código. É tornar o nível exigido um ajuste
-- de AMBIENTE, com três características que o mantêm honesto:
--
--   1. O padrão é `aal2`. Quem não mexe, fica seguro.
--   2. A tabela é inalcançável pela API: RLS ligada, nenhuma política, nenhum
--      privilégio. Só se altera com acesso direto ao banco (SQL Editor do
--      painel ou `psql` com a senha do projeto) — nunca pelo aplicativo, nunca
--      por um usuário autenticado, nunca pelo assistente.
--   3. `supabase/tests/02_conformidade.sql` FALHA quando o nível está em
--      `aal1`, a menos que a execução declare explicitamente que é ambiente de
--      homologação. Assim ninguém publica para uso real com a regra relaxada
--      sem que apareça.
--
-- Em produção, com MFA disponível, isto fica em `aal2` e nada muda.
-- =============================================================================

create table public.politica_autenticacao (
  -- Linha única: a restrição de chave primária com CHECK impede uma segunda.
  id boolean primary key default true check (id),
  nivel_exigido text not null default 'aal2' check (nivel_exigido in ('aal1', 'aal2')),
  -- Obrigatório justificar quando se sai do padrão; fica no banco, auditável.
  motivo text,
  atualizado_em timestamptz not null default now(),
  constraint relaxamento_exige_motivo
    check (nivel_exigido = 'aal2' or length(btrim(coalesce(motivo, ''))) >= 10)
);

insert into public.politica_autenticacao (id, nivel_exigido) values (true, 'aal2');

comment on table public.politica_autenticacao is
  'Nível de autenticação exigido para acessar dados de operação. Inalcançável '
  'pela API: só muda com acesso direto ao banco. O padrão é aal2.';

-- Sem privilégios e sem política: nem `anon` nem `authenticated` leem ou
-- escrevem. As funções que consultam esta tabela são SECURITY DEFINER e por
-- isso enxergam a linha.
alter table public.politica_autenticacao enable row level security;
revoke all on public.politica_autenticacao from anon, authenticated;

create or replace function app.nivel_exigido()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.nivel_exigido from public.politica_autenticacao p limit 1), 'aal2')
$$;

revoke execute on function app.nivel_exigido() from public, anon, authenticated;

-- `tem_aal2` passa a significar "a sessão atingiu o nível exigido por este
-- ambiente". O nome se mantém para não espalhar a mudança pelas políticas, e o
-- comportamento padrão é idêntico ao anterior.
create or replace function app.tem_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Sem sessão não há nível nenhum, em qualquer ambiente.
    when auth.uid() is null then false
    when app.nivel_exigido() = 'aal1' then true
    else app.aal() = 'aal2'
  end
$$;

comment on function app.tem_aal2() is
  'Verdadeiro quando a sessão atingiu o nível de autenticação exigido pelo '
  'ambiente (aal2 por padrão). Nunca verdadeiro sem sessão.';

grant execute on function app.tem_aal2() to authenticated;
