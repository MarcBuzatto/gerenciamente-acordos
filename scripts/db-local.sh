#!/usr/bin/env bash
# Recria um banco local, aplica o bootstrap de teste e todas as migrações.
#
# Serve para desenvolver e testar as migrações sem Docker. Em homologação e
# produção quem aplica as migrações é a CLI do Supabase (`supabase db push`);
# o bootstrap NÃO é aplicado lá — a plataforma já fornece auth e papéis.
#
#   PGHOST_DIR=/tmp PGPORT=55432 ./scripts/db-local.sh [nome_do_banco]
set -euo pipefail

DB="${1:-acordos_test}"
PGPORT="${PGPORT:-55432}"
PGHOST_DIR="${PGHOST_DIR:-/tmp}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

admin() { psql -v ON_ERROR_STOP=1 -q "postgres://postgres@/postgres?host=${PGHOST_DIR}&port=${PGPORT}" "$@"; }
alvo() { psql -v ON_ERROR_STOP=1 -q "postgres://postgres@/${DB}?host=${PGHOST_DIR}&port=${PGPORT}" "$@"; }

admin -c "drop database if exists ${DB} with (force);" >/dev/null
admin -c "create database ${DB};" >/dev/null

alvo -f "${RAIZ}/supabase/tests/00_bootstrap_local.sql" >/dev/null

for arquivo in "${RAIZ}"/supabase/migrations/*.sql; do
  printf 'aplicando %s\n' "$(basename "${arquivo}")"
  alvo -f "${arquivo}" >/dev/null
done

printf 'banco %s pronto\n' "${DB}"
