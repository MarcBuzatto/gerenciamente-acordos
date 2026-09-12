-- =============================================================================
-- 0003 — Autorização: privilégios, helpers e Row Level Security
--
-- Três camadas, nesta ordem:
--
--   1. GRANT/REVOKE — o papel `authenticated` simplesmente não tem INSERT,
--      UPDATE ou DELETE nas tabelas financeiras. Escrita financeira só pelas
--      funções transacionais da migração 0004.
--   2. RLS — filtra LINHAS por operação e papel.
--   3. Projeções por função — RLS não esconde COLUNAS. O assistente não recebe
--      SELECT nas tabelas com principal, juros e totais; ele lê pelas funções
--      da migração 0004, que devolvem só o necessário para cobrar.
--
-- Além disso, todo acesso a dados de operação exige `aal2`: a sessão precisa ter
-- passado pela verificação em duas etapas. O bloqueio está aqui, no banco, não
-- só na interface.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de identidade e papel
--
-- SECURITY DEFINER com `search_path` fixo e escopo mínimo: leem apenas o
-- vínculo do próprio usuário. Sem isso, a política de `membros_operacao`
-- consultaria a própria tabela e entraria em recursão.
-- -----------------------------------------------------------------------------

create or replace function app.uid()
returns uuid
language sql
stable
set search_path = ''
as $$ select auth.uid() $$;

-- Nível de garantia da autenticação da sessão corrente (aal1 / aal2).
create or replace function app.aal()
returns text
language sql
stable
set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') $$;

create or replace function app.tem_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$ select app.aal() = 'aal2' $$;

-- Papel do usuário corrente na operação, ou NULL se não houver vínculo ativo.
create or replace function app.papel_na_operacao(p_operacao uuid)
returns app.papel_membro
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
    from public.membros_operacao m
   where m.operacao_id = p_operacao
     and m.usuario_id = auth.uid()
     and m.ativo
$$;

-- Vínculo ativo + aal2. É o predicado base de quase toda política.
-- A revogação de acesso passa a valer na consulta seguinte, mesmo com sessão
-- previamente aberta, porque o vínculo é lido a cada chamada.
create or replace function app.eh_membro(p_operacao uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select app.papel_na_operacao(p_operacao) is not null and app.tem_aal2() $$;

create or replace function app.eh_proprietario(p_operacao uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select app.papel_na_operacao(p_operacao) = 'proprietario' and app.tem_aal2() $$;

create or replace function app.eh_assistente(p_operacao uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select app.papel_na_operacao(p_operacao) = 'assistente' and app.tem_aal2() $$;

revoke execute on function app.papel_na_operacao(uuid) from public;
grant execute on function app.papel_na_operacao(uuid) to authenticated;
grant execute on function app.uid(), app.aal(), app.tem_aal2(),
  app.eh_membro(uuid), app.eh_proprietario(uuid), app.eh_assistente(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Privilégios de tabela
--
-- Ponto de partida: o papel anônimo não enxerga nada, e o autenticado não
-- escreve diretamente em nada financeiro.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;
revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated;

-- Leitura direta permitida (a RLS abaixo restringe as linhas).
grant select on public.perfis, public.operacoes, public.membros_operacao,
  public.configuracoes_operacao, public.clientes, public.convites,
  public.contratos, public.parcelas, public.pagamentos,
  public.alocacoes_pagamento, public.estornos_pagamento, public.auditoria
  to authenticated;

-- Escrita direta permitida: apenas cadastro e edição de cliente e o próprio
-- perfil. Todo o resto passa por função transacional.
grant insert, update on public.perfis to authenticated;
grant insert, update on public.clientes to authenticated;
grant update on public.configuracoes_operacao to authenticated;

-- Sequência da auditoria: escrita só acontece dentro das funções (definer).
revoke all on sequence public.auditoria_id_seq from anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.perfis                enable row level security;
alter table public.operacoes             enable row level security;
alter table public.membros_operacao      enable row level security;
alter table public.configuracoes_operacao enable row level security;
alter table public.convites              enable row level security;
alter table public.clientes              enable row level security;
alter table public.contratos             enable row level security;
alter table public.parcelas              enable row level security;
alter table public.pagamentos            enable row level security;
alter table public.alocacoes_pagamento   enable row level security;
alter table public.estornos_pagamento    enable row level security;
alter table public.auditoria             enable row level security;

-- Nenhuma tabela tem política para `anon`: sessão anônima não lê dado de
-- operação nenhuma.

-- Perfis ------------------------------------------------------------------
-- Liberado em aal1: a tela precisa do nome do usuário antes de concluir o
-- segundo fator. Não há dado de operação aqui.
create policy perfis_seleciona_proprio on public.perfis
  for select to authenticated
  using (id = app.uid());

-- Membros da mesma operação veem o nome de quem lançou cada pagamento. Sem
-- isso o histórico mostraria identificadores em vez de pessoas.
create policy perfis_seleciona_colega on public.perfis
  for select to authenticated
  using (
    exists (
      select 1
        from public.membros_operacao meu
        join public.membros_operacao dele on dele.operacao_id = meu.operacao_id
       where meu.usuario_id = app.uid() and meu.ativo
         and dele.usuario_id = public.perfis.id
         and app.tem_aal2()
    )
  );

create policy perfis_insere_proprio on public.perfis
  for insert to authenticated
  with check (id = app.uid());

create policy perfis_atualiza_proprio on public.perfis
  for update to authenticated
  using (id = app.uid())
  with check (id = app.uid());

-- Operações ---------------------------------------------------------------
create policy operacoes_seleciona_membro on public.operacoes
  for select to authenticated
  using (app.eh_membro(id));

-- Criar operação é feito por `public.provisionar_proprietario()`.
-- Não existe política de INSERT, e `authenticated` não tem o privilégio.

-- Membros -----------------------------------------------------------------
-- Um membro vê a equipe da própria operação. Não há política de INSERT,
-- UPDATE ou DELETE: o usuário não pode criar vínculo, mudar o próprio papel
-- nem se mover de operação. Isso só acontece nas funções da migração 0004.
create policy membros_seleciona_da_operacao on public.membros_operacao
  for select to authenticated
  using (app.eh_membro(operacao_id));

-- Configurações -----------------------------------------------------------
create policy configuracoes_seleciona_membro on public.configuracoes_operacao
  for select to authenticated
  using (app.eh_membro(operacao_id));

-- Só o proprietário altera regras financeiras (taxa padrão, feriados).
create policy configuracoes_atualiza_proprietario on public.configuracoes_operacao
  for update to authenticated
  using (app.eh_proprietario(operacao_id))
  with check (app.eh_proprietario(operacao_id));

-- Convites ----------------------------------------------------------------
-- Só o proprietário lista os convites que emitiu. O destinatário não precisa
-- ler a tabela: ele usa `public.aceitar_convite(token)`.
create policy convites_seleciona_proprietario on public.convites
  for select to authenticated
  using (app.eh_proprietario(operacao_id));

-- Clientes ----------------------------------------------------------------
create policy clientes_seleciona_membro on public.clientes
  for select to authenticated
  using (app.eh_membro(operacao_id));

-- Proprietário e assistente cadastram clientes. `criado_por` é forçado ao
-- usuário da sessão: não dá para forjar autoria nem inserir em outra operação.
create policy clientes_insere_membro on public.clientes
  for insert to authenticated
  with check (app.eh_membro(operacao_id) and criado_por = app.uid());

-- Editar é do proprietário (permissão inicial, documentada como provisória).
create policy clientes_atualiza_proprietario on public.clientes
  for update to authenticated
  using (app.eh_proprietario(operacao_id))
  with check (app.eh_proprietario(operacao_id));

-- Mover um registro de operação, reescrever autoria ou data de criação não é
-- edição: é falsificação. O gatilho recusa, mesmo para quem é proprietário das
-- duas operações envolvidas.
create or replace function app.congelar_campos_de_origem()
returns trigger
language plpgsql
as $$
begin
  if new.operacao_id is distinct from old.operacao_id then
    raise exception 'Não é permitido mover registro entre operações.'
      using errcode = 'check_violation';
  end if;
  if new.criado_por is distinct from old.criado_por
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Autoria e data de criação são imutáveis.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger clientes_congela_origem before update on public.clientes
  for each row execute function app.congelar_campos_de_origem();

-- Contratos, parcelas, pagamentos, alocações, estornos --------------------
-- Estas tabelas carregam principal, juros, taxa e totais. SELECT direto é
-- exclusivo do proprietário. O assistente chega aos dados de cobrança pelas
-- funções `public.listar_vencimentos` e `public.parcela_para_cobranca`, que
-- devolvem apenas valor devido, acréscimo e identificação — nunca capital,
-- juros ou totais da carteira.
create policy contratos_seleciona_proprietario on public.contratos
  for select to authenticated
  using (app.eh_proprietario(operacao_id));

create policy parcelas_seleciona_proprietario on public.parcelas
  for select to authenticated
  using (app.eh_proprietario(operacao_id));

create policy pagamentos_seleciona_proprietario on public.pagamentos
  for select to authenticated
  using (app.eh_proprietario(operacao_id));

create policy alocacoes_seleciona_proprietario on public.alocacoes_pagamento
  for select to authenticated
  using (app.eh_proprietario(operacao_id));

create policy estornos_seleciona_proprietario on public.estornos_pagamento
  for select to authenticated
  using (app.eh_proprietario(operacao_id));

-- Auditoria ---------------------------------------------------------------
-- Leitura pelo proprietário; escrita só dentro das funções de domínio.
create policy auditoria_seleciona_proprietario on public.auditoria
  for select to authenticated
  using (app.eh_proprietario(operacao_id));
