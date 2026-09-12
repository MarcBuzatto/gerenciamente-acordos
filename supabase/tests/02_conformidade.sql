-- =============================================================================
-- Conformidade de segurança do esquema.
--
-- Diferente dos outros arquivos de teste, este NÃO cria dados e NÃO depende do
-- bootstrap local: ele inspeciona o catálogo do banco. Por isso pode — e deve —
-- ser executado também contra o projeto Supabase de homologação, logo após o
-- `supabase db push`, para confirmar que o que vale lá é o que foi revisado
-- aqui.
--
--   psql "$URL_DO_BANCO" -f supabase/tests/02_conformidade.sql
--
-- Falha com erro (e código de saída diferente de zero) no primeiro problema.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.conferir(condicao boolean, descricao text, detalhe text default null)
returns void language plpgsql as $$
begin
  if condicao is not true then
    raise exception 'FALHOU: %', descricao || coalesce(' → ' || detalhe, '');
  end if;
  raise notice 'ok — %', descricao;
end;
$$;

do $$
declare
  v_lista text;
begin
  -- 1. Toda tabela da aplicação com RLS ligada ------------------------------
  select string_agg(c.relname, ', ') into v_lista
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  perform pg_temp.conferir(v_lista is null, 'todas as tabelas de public têm RLS', v_lista);

  -- 2. Toda tabela com pelo menos uma política ------------------------------
  select string_agg(c.relname, ', ') into v_lista
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  perform pg_temp.conferir(v_lista is null, 'nenhuma tabela ficou sem política', v_lista);

  -- 3. Papel anônimo sem privilégio nenhum ----------------------------------
  select string_agg(distinct table_name || ':' || privilege_type, ', ') into v_lista
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon';
  perform pg_temp.conferir(v_lista is null, 'anon não tem privilégio em nenhuma tabela', v_lista);

  select string_agg(c.relname, ', ') into v_lista
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (
       select 1 from pg_policy p
        where p.polrelid = c.oid
          and (p.polroles = '{0}'::oid[] or 'anon'::regrole = any(p.polroles))
     );
  perform pg_temp.conferir(v_lista is null, 'nenhuma política alcança anon', v_lista);

  -- 4. Sem escrita direta nas tabelas financeiras ---------------------------
  -- Contrato, parcela, pagamento, alocação, estorno e auditoria só mudam
  -- dentro das funções transacionais.
  select string_agg(table_name || ':' || privilege_type, ', ') into v_lista
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
     and table_name in ('contratos', 'parcelas', 'pagamentos', 'alocacoes_pagamento',
                        'estornos_pagamento', 'auditoria', 'operacoes', 'membros_operacao',
                        'convites');
  perform pg_temp.conferir(v_lista is null,
    'authenticated não escreve direto em tabela financeira nem em vínculo', v_lista);

  -- 5. DELETE não é concedido a ninguém além do dono ------------------------
  select string_agg(table_name || ':' || grantee, ', ') into v_lista
    from information_schema.role_table_grants
   where table_schema = 'public' and privilege_type = 'DELETE'
     and grantee in ('anon', 'authenticated');
  perform pg_temp.conferir(v_lista is null, 'nenhum DELETE concedido à aplicação', v_lista);

  -- 6. SECURITY DEFINER sempre com search_path fixo -------------------------
  -- Sem isso, um schema no caminho de busca poderia sequestrar a resolução de
  -- nomes dentro de uma função que roda como dono.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_lista
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app')
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%'
     );
  perform pg_temp.conferir(v_lista is null,
    'toda função SECURITY DEFINER tem search_path fixo', v_lista);

  -- 7. Funções internas de apoio fora do alcance do usuário -----------------
  select string_agg(p.proname, ', ') into v_lista
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('registrar_auditoria', 'exigir_membro', 'exigir_proprietario')
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));
  perform pg_temp.conferir(v_lista is null,
    'funções internas de apoio não são executáveis pela aplicação', v_lista);

  -- 8. Nenhuma função de simulação de identidade publicada ------------------
  -- O bootstrap de teste local NÃO pode ter ido junto para o projeto: nada em
  -- `public` ou `app` pode forjar claims de JWT.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_lista
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app')
     and p.prosrc like '%request.jwt.claims%';
  perform pg_temp.conferir(v_lista is null,
    'nenhuma função da aplicação manipula claims de JWT', v_lista);

  -- 9. Integridade entre operações garantida por chave estrangeira composta --
  select string_agg(conname, ', ') into v_lista
    from (
      select 'contrato_cliente_mesma_operacao' as conname
      union all select 'parcela_contrato_mesma_operacao'
      union all select 'pagamento_contrato_mesma_operacao'
      union all select 'alocacao_pagamento_mesma_operacao'
      union all select 'alocacao_parcela_mesma_operacao'
      union all select 'estorno_pagamento_mesma_operacao'
    ) esperadas
   where not exists (
     select 1 from pg_constraint c where c.conname = esperadas.conname and c.contype = 'f'
   );
  perform pg_temp.conferir(v_lista is null,
    'chaves estrangeiras compostas com operacao_id estão presentes', v_lista);

  -- 10. Uma parcela, um pagamento ativo -------------------------------------
  perform pg_temp.conferir(
    exists (
      select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'alocacoes_parcela_ativa_idx'
         and indexdef like '%UNIQUE%' and indexdef like '%NOT revogada%'
    ),
    'índice único parcial impede dois pagamentos ativos na mesma parcela'
  );

  -- 11. Histórico financeiro protegido contra exclusão ----------------------
  select string_agg(t.tabela, ', ') into v_lista
    from (values ('contratos'), ('parcelas'), ('pagamentos'), ('alocacoes_pagamento'),
                 ('estornos_pagamento'), ('auditoria'), ('clientes')) as t(tabela)
   where not exists (
     select 1 from pg_trigger tg
       join pg_class c on c.oid = tg.tgrelid
      where c.relname = t.tabela and not tg.tgisinternal and tg.tgtype & 8 = 8
   );
  perform pg_temp.conferir(v_lista is null,
    'gatilho de bloqueio de exclusão presente no histórico financeiro', v_lista);

  -- 12. Exigência de segundo fator sem porta dos fundos --------------------
  -- `app.tem_aal2()` precisa comparar a claim `aal` da sessão com 'aal2', sem
  -- depender de tabela de configuração nem de qualquer outro caminho que
  -- permitisse rebaixar a exigência sem alterar código revisado.
  select pg_get_functiondef(p.oid) into v_lista
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'tem_aal2';
  perform pg_temp.conferir(v_lista like '%aal2%', 'app.tem_aal2 compara com aal2');
  perform pg_temp.conferir(
    v_lista not ilike '%politica_autenticacao%' and v_lista not ilike '%nivel_exigido%',
    'exigência de aal2 não depende de configuração ajustável'
  );

  -- 13. Dinheiro dentro da faixa segura para JavaScript ---------------------
  perform pg_temp.conferir(
    (select count(*) from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'app' and t.typname = 'centavos') = 1,
    'domínio app.centavos existe, limitando os valores monetários'
  );

  raise notice 'Conformidade: todos os controles passaram.';
end
$$;
