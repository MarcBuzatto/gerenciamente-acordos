#!/usr/bin/env bash
# Pré-checagem do banco ANTES de aplicar qualquer migração ou configuração.
#
# `auth.users` vazio não prova que o banco está vazio: pode haver tabelas de
# outro projeto, arquivos no storage, migrações já aplicadas, políticas e
# funções próprias. Este script olha o banco inteiro e imprime um veredito.
#
#   read -rsp 'URL do banco: ' SUPABASE_DB_URL && export SUPABASE_DB_URL && echo
#   ./scripts/conferir-destino.sh
#
# A URL não é passada por argumento de propósito: ela contém a senha e ficaria
# no histórico do shell.
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Defina SUPABASE_DB_URL antes de rodar (veja o cabeçalho deste arquivo)." >&2
  exit 2
fi

psql() { command psql "$SUPABASE_DB_URL" -X -q "$@"; }

echo "=============================================================="
echo " 1. Identificação do servidor"
echo "=============================================================="
psql -c "
  select current_database() as banco,
         current_user       as usuario,
         version()          as versao,
         (now() at time zone 'America/Bahia')::timestamp as agora_bahia;"

echo "=============================================================="
echo " 2. Schemas não-sistema e quantos objetos têm"
echo "=============================================================="
psql -c "
  select n.nspname as schema,
         (select count(*) from pg_class c
           where c.relnamespace = n.oid and c.relkind = 'r') as tabelas,
         (select count(*) from pg_class c
           where c.relnamespace = n.oid and c.relkind = 'v') as views,
         (select count(*) from pg_proc p where p.pronamespace = n.oid) as funcoes
    from pg_namespace n
   where n.nspname not in ('pg_catalog','information_schema','pg_toast')
     and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
   order by 1;"

echo "=============================================================="
echo " 3. Tabelas em public, com contagem real de linhas"
echo "=============================================================="
psql -c "
  do \$\$
  declare r record; n bigint; achou boolean := false;
  begin
    for r in select tablename from pg_tables where schemaname = 'public' order by 1 loop
      execute format('select count(*) from public.%I', r.tablename) into n;
      raise notice '  % → % linha(s)', rpad(r.tablename, 28), n;
      achou := true;
    end loop;
    if not achou then raise notice '  (nenhuma tabela em public)'; end if;
  end \$\$;"

echo "=============================================================="
echo " 4. Dados da plataforma (auth, storage, realtime)"
echo "=============================================================="
# `to_regclass` devolve NULL quando a tabela não existe, então o script serve
# tanto para um projeto Supabase quanto para o PostgreSQL de teste local.
psql -c "
  do \$\$
  declare r record; n bigint;
  begin
    for r in select unnest(array[
      'auth.users','auth.mfa_factors','auth.sessions',
      'storage.buckets','storage.objects'
    ]) as alvo loop
      if to_regclass(r.alvo) is null then
        raise notice '  % → não existe neste servidor', rpad(r.alvo, 20);
      else
        execute format('select count(*) from %s', r.alvo) into n;
        raise notice '  % → % linha(s)', rpad(r.alvo, 20), n;
      end if;
    end loop;
  end \$\$;"

echo "=============================================================="
echo " 5. Migrações já aplicadas"
echo "=============================================================="
psql -c "select version, name from supabase_migrations.schema_migrations order by version;" \
  2>/dev/null || echo "  (sem histórico de migrações — projeto novo)"

echo "=============================================================="
echo " 6. Veredito"
echo "=============================================================="
psql -c "
  do \$\$
  declare
    v_tabelas int; v_usuarios bigint := 0; v_arquivos bigint := 0; v_app int;
  begin
    select count(*) into v_tabelas from pg_tables where schemaname = 'public';
    if to_regclass('auth.users') is not null then
      execute 'select count(*) from auth.users' into v_usuarios;
    end if;
    if to_regclass('storage.objects') is not null then
      execute 'select count(*) from storage.objects' into v_arquivos;
    end if;
    select count(*) into v_app from pg_namespace where nspname = 'app';

    if v_tabelas = 0 and v_usuarios = 0 and v_arquivos = 0 then
      raise notice 'LIMPO — banco vazio, seguro para aplicar as migrações.';
    elsif v_app = 1 then
      raise notice 'JÁ TEM ESTE PROJETO — o schema app existe, com % tabela(s) em public, % usuário(s) e % arquivo(s).', v_tabelas, v_usuarios, v_arquivos;
      raise notice 'É um re-push. Revise o --dry-run antes de continuar.';
    else
      raise notice 'ATENÇÃO — % tabela(s) em public, % usuário(s) e % arquivo(s), e o schema app NÃO existe.', v_tabelas, v_usuarios, v_arquivos;
      raise notice 'Isto parece ser OUTRO projeto. NÃO aplique nada sem confirmar o destino.';
    end if;
  end \$\$;"
echo
