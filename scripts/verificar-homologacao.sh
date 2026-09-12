#!/usr/bin/env bash
# Verifica um projeto Supabase depois do `supabase db push`.
#
# Confere se o destino é mesmo o pretendido, se está vazio de dados reais e se
# as políticas, privilégios e funções chegaram como revisado.
#
# A URL do banco NÃO é pedida na linha de comando (ela contém a senha e ficaria
# no histórico do shell). Exporte antes:
#
#   read -rsp 'URL do banco: ' SUPABASE_DB_URL && export SUPABASE_DB_URL && echo
#   ./scripts/verificar-homologacao.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Defina SUPABASE_DB_URL antes de rodar (veja o cabeçalho deste arquivo)." >&2
  exit 2
fi

echo "== Destino =="
psql "$SUPABASE_DB_URL" -X -q -c "
  select current_database() as banco,
         inet_server_addr()::text as servidor,
         current_user as usuario,
         (now() at time zone 'America/Bahia')::date as data_bahia;"

echo
echo "== Volume de dados (confirme que não há dado real do cliente) =="
psql "$SUPABASE_DB_URL" -X -q -c "
  select 'clientes' as tabela, count(*) from public.clientes
  union all select 'contratos', count(*) from public.contratos
  union all select 'parcelas', count(*) from public.parcelas
  union all select 'pagamentos', count(*) from public.pagamentos
  union all select 'operacoes', count(*) from public.operacoes
  union all select 'usuarios (auth)', count(*) from auth.users
  order by 1;"

echo
echo "== Migrações aplicadas =="
psql "$SUPABASE_DB_URL" -X -q -c "
  select version from supabase_migrations.schema_migrations order by version;" \
  2>/dev/null || echo "(tabela de migrações não encontrada — o db push já rodou?)"

echo
echo "== Conformidade =="
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f "${RAIZ}/supabase/tests/02_conformidade.sql"

echo
echo "Verificação concluída."
