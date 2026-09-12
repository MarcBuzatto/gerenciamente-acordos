-- =============================================================================
-- 0001 — Esquema base
--
-- Convenções desta migração:
--
-- * Dinheiro em BIGINT de centavos. Nunca float. Há CHECK limitando os valores
--   a 999.999.999.999 centavos (R$ 9.999.999.999,99), bem abaixo de 2^53, para
--   que a serialização JSON em JavaScript não perca precisão.
-- * Taxa de juros em NUMERIC(9,4) — decimal exato, não binário.
-- * Vencimento e pagamento são DATE (datas civis, sem fuso). Criação e
--   auditoria são TIMESTAMPTZ, sempre gravados pelo servidor.
-- * Todo registro que pertence a uma operação carrega `operacao_id`, e as
--   chaves estrangeiras são compostas com ele. Assim o banco impede, por
--   estrutura, que um contrato aponte para cliente de outra operação ou que um
--   pagamento seja alocado a parcela de outra operação.
-- * Não há exclusão física de histórico financeiro. Acesso se revoga, convite
--   se revoga, pagamento se estorna — nada disso apaga linha.
-- =============================================================================

-- No Supabase as extensões vivem no schema `extensions`; manter isso explícito
-- evita que `digest`/`gen_random_bytes` resolvam por `search_path`.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Schema de apoio: funções de domínio e helpers de autorização.
create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type app.papel_membro as enum ('proprietario', 'assistente');
create type app.frequencia_contrato as enum ('diaria', 'semanal', 'mensal');
create type app.meio_pagamento as enum ('pix');
create type app.tipo_pagamento as enum ('parcela', 'quitacao');
create type app.tipo_veiculo as enum ('moto', 'carro');
create type app.condicao_veiculo as enum ('proprio', 'alugado');

-- Regra de atraso gravada no contrato. `diaria_dobra_unica` é a regra
-- confirmada pelo cliente; `sem_acrescimo` cobre semanal e mensal, cujas
-- regras continuam pendentes de validação.
create type app.regra_atraso as enum ('diaria_dobra_unica', 'sem_acrescimo');

-- -----------------------------------------------------------------------------
-- Domínio de dinheiro
-- -----------------------------------------------------------------------------

create domain app.centavos as bigint
  check (value >= 0 and value <= 999999999999);

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 120),
  email text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is
  'Dados de exibição do usuário. A identidade em si vive em auth.users.';

-- -----------------------------------------------------------------------------
-- Operações
-- -----------------------------------------------------------------------------

create table public.operacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  cidade text not null default 'Feira de Santana – BA',
  -- Cada operação tem sua própria localização; a do cliente original entra
  -- apenas como padrão inicial, não como regra universal.
  fuso text not null default 'America/Bahia',
  criado_em timestamptz not null default now(),
  criado_por uuid not null references auth.users (id)
);

create table public.membros_operacao (
  operacao_id uuid not null references public.operacoes (id),
  usuario_id uuid not null references auth.users (id),
  papel app.papel_membro not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  revogado_em timestamptz,
  revogado_por uuid references auth.users (id),
  primary key (operacao_id, usuario_id),
  constraint membro_revogado_coerente
    check ((ativo and revogado_em is null) or (not ativo and revogado_em is not null))
);

comment on table public.membros_operacao is
  'Vínculo usuário↔operação. Revogar acesso desativa a linha; nunca a apaga, '
  'para que a autoria de lançamentos antigos continue resolvível.';

create index membros_operacao_usuario_idx
  on public.membros_operacao (usuario_id) where ativo;

-- Garante que uma operação sempre tenha ao menos um proprietário ativo.
create unique index membros_operacao_proprietario_idx
  on public.membros_operacao (operacao_id, usuario_id)
  where papel = 'proprietario' and ativo;

create table public.configuracoes_operacao (
  operacao_id uuid primary key references public.operacoes (id),
  -- Identificadores das regras de feriado ativas, iguais aos de src/domain/feriados.ts.
  feriados_ativos text[] not null default array[
    'confraternizacao','sexta-santa','tiradentes','trabalho','corpus-christi',
    'sao-joao','independencia-bahia','santana','independencia','aparecida',
    'finados','republica','consciencia-negra','natal'
  ],
  taxa_padrao numeric(9,4) not null default 40.0000
    check (taxa_padrao >= 0 and taxa_padrao <= 10000),
  frequencia_padrao app.frequencia_contrato not null default 'diaria',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id)
);

comment on column public.configuracoes_operacao.feriados_ativos is
  'Mudar esta lista vale para contratos NOVOS. Contratos existentes guardam '
  'seu próprio snapshot e não são recalculados.';

-- -----------------------------------------------------------------------------
-- Convites de assistente
-- -----------------------------------------------------------------------------

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  email text not null check (position('@' in email) > 1),
  papel app.papel_membro not null default 'assistente'
    -- Esta etapa só convida assistente. Proprietário adicional fica fora do escopo.
    check (papel = 'assistente'),
  -- Só o hash do token é persistido. O token em claro existe apenas no link
  -- entregue ao destinatário.
  token_hash text not null unique,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  criado_por uuid not null references auth.users (id),
  aceito_em timestamptz,
  aceito_por uuid references auth.users (id),
  revogado_em timestamptz,
  revogado_por uuid references auth.users (id),
  constraint convite_uso_unico
    check (not (aceito_em is not null and revogado_em is not null))
);

create index convites_operacao_idx on public.convites (operacao_id, criado_em desc);
create index convites_email_idx on public.convites (lower(email));

-- Um convite pendente por e-mail e operação.
create unique index convites_pendente_idx
  on public.convites (operacao_id, lower(email))
  where aceito_em is null and revogado_em is null;

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  nome text not null check (length(btrim(nome)) between 2 and 160),
  telefone text not null check (length(regexp_replace(telefone, '\D', '', 'g')) between 10 and 11),
  cpf_cnpj text,
  email text,
  rg text,
  nascimento date,
  cep text,
  rua text,
  numero text,
  complemento text,
  cidade text,
  estado text check (estado is null or length(estado) = 2),
  veiculo_tipo app.tipo_veiculo,
  veiculo_condicao app.condicao_veiculo,
  placa text,
  criado_em timestamptz not null default now(),
  criado_por uuid not null references auth.users (id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id),
  -- Alvo da chave estrangeira composta usada pelos contratos.
  unique (operacao_id, id)
);

create index clientes_operacao_nome_idx on public.clientes (operacao_id, nome);
create index clientes_operacao_telefone_idx
  on public.clientes (operacao_id, (regexp_replace(telefone, '\D', '', 'g')));

-- -----------------------------------------------------------------------------
-- Contratos
-- -----------------------------------------------------------------------------

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  cliente_id uuid not null,
  numero integer not null check (numero > 0),

  principal_cents app.centavos not null check (principal_cents > 0),
  taxa_percent numeric(9,4) not null check (taxa_percent >= 0 and taxa_percent <= 10000),
  juros_cents app.centavos not null,
  total_cents app.centavos not null,

  frequencia app.frequencia_contrato not null,
  qtd_parcelas integer not null check (qtd_parcelas between 1 and 400),
  primeiro_vencimento date not null,
  data_contrato date not null,
  observacao text,

  -- Snapshot das condições no momento da criação. Alterar as configurações da
  -- operação depois NÃO recalcula este contrato.
  snapshot_feriados text[] not null,
  snapshot_fuso text not null,
  snapshot_regra_atraso app.regra_atraso not null,

  criado_em timestamptz not null default now(),
  criado_por uuid not null references auth.users (id),

  constraint contrato_total_fecha check (total_cents = principal_cents + juros_cents),
  -- Impede que o contrato aponte para cliente de outra operação.
  constraint contrato_cliente_mesma_operacao
    foreign key (operacao_id, cliente_id) references public.clientes (operacao_id, id),
  unique (operacao_id, numero),
  unique (operacao_id, id)
);

create index contratos_operacao_idx on public.contratos (operacao_id, numero desc);
create index contratos_cliente_idx on public.contratos (operacao_id, cliente_id);

-- -----------------------------------------------------------------------------
-- Parcelas
-- -----------------------------------------------------------------------------

create table public.parcelas (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  contrato_id uuid not null,
  numero integer not null check (numero > 0),
  vencimento date not null,
  valor_cents app.centavos not null check (valor_cents > 0),
  -- Composição definida na geração. principal + juros = valor.
  principal_cents app.centavos not null,
  juros_cents app.centavos not null,

  constraint parcela_composicao_fecha check (valor_cents = principal_cents + juros_cents),
  constraint parcela_contrato_mesma_operacao
    foreign key (operacao_id, contrato_id) references public.contratos (operacao_id, id),
  unique (contrato_id, numero),
  unique (operacao_id, id)
);

create index parcelas_cobranca_idx on public.parcelas (operacao_id, vencimento);
create index parcelas_contrato_idx on public.parcelas (contrato_id, numero);

-- -----------------------------------------------------------------------------
-- Pagamentos
-- -----------------------------------------------------------------------------

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  contrato_id uuid not null,

  -- Data civil real do recebimento. Base de todo cálculo e dos resumos.
  data_pagamento date not null,
  -- Instante da digitação, sempre do relógio do servidor. Só auditoria.
  registrado_em timestamptz not null default now(),
  registrado_por uuid not null references auth.users (id),

  valor_original_cents app.centavos not null,
  acrescimo_cents app.centavos not null default 0,
  valor_total_cents app.centavos not null,

  meio app.meio_pagamento not null default 'pix',
  tipo app.tipo_pagamento not null,

  -- Regra de atraso efetivamente aplicada neste recebimento.
  regra_atraso_aplicada app.regra_atraso not null,

  -- Reenvio após perda de conexão não duplica lançamento.
  chave_idempotencia text not null,

  estornado_em timestamptz,
  estornado_por uuid references auth.users (id),

  constraint pagamento_total_fecha
    check (valor_total_cents = valor_original_cents + acrescimo_cents),
  constraint pagamento_contrato_mesma_operacao
    foreign key (operacao_id, contrato_id) references public.contratos (operacao_id, id),
  constraint pagamento_estorno_coerente
    check ((estornado_em is null and estornado_por is null)
        or (estornado_em is not null and estornado_por is not null)),
  unique (operacao_id, chave_idempotencia),
  unique (operacao_id, id)
);

create index pagamentos_contrato_idx on public.pagamentos (contrato_id, data_pagamento);
create index pagamentos_recebimento_idx
  on public.pagamentos (operacao_id, data_pagamento) where estornado_em is null;

-- -----------------------------------------------------------------------------
-- Alocações de pagamento (pagamento ↔ parcela)
-- -----------------------------------------------------------------------------

create table public.alocacoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  pagamento_id uuid not null,
  parcela_id uuid not null,
  valor_original_cents app.centavos not null,
  acrescimo_cents app.centavos not null default 0,
  -- Espelha pagamentos.estornado_em, mantido por gatilho. Existe para que o
  -- índice único parcial abaixo possa garantir "uma parcela, um pagamento ativo".
  revogada boolean not null default false,

  constraint alocacao_pagamento_mesma_operacao
    foreign key (operacao_id, pagamento_id) references public.pagamentos (operacao_id, id),
  constraint alocacao_parcela_mesma_operacao
    foreign key (operacao_id, parcela_id) references public.parcelas (operacao_id, id),
  unique (pagamento_id, parcela_id)
);

-- A mesma parcela não pode ter dois pagamentos ativos. É esta restrição — e não
-- o botão desabilitado na tela — que impede duplo clique, reenvio e corrida
-- entre duas sessões.
create unique index alocacoes_parcela_ativa_idx
  on public.alocacoes_pagamento (parcela_id) where not revogada;

create index alocacoes_pagamento_idx on public.alocacoes_pagamento (pagamento_id);

create or replace function app.sincronizar_revogacao_alocacoes()
returns trigger
language plpgsql
as $$
begin
  update public.alocacoes_pagamento
     set revogada = (new.estornado_em is not null)
   where pagamento_id = new.id
     and revogada is distinct from (new.estornado_em is not null);
  return new;
end;
$$;

create trigger pagamentos_sincroniza_alocacoes
  after update of estornado_em on public.pagamentos
  for each row execute function app.sincronizar_revogacao_alocacoes();

-- -----------------------------------------------------------------------------
-- Estornos
-- -----------------------------------------------------------------------------

create table public.estornos_pagamento (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes (id),
  -- Um pagamento só é estornado uma vez.
  pagamento_id uuid not null unique,
  motivo text not null check (length(btrim(motivo)) between 3 and 500),
  criado_em timestamptz not null default now(),
  criado_por uuid not null references auth.users (id),

  constraint estorno_pagamento_mesma_operacao
    foreign key (operacao_id, pagamento_id) references public.pagamentos (operacao_id, id)
);

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------

create table public.auditoria (
  id bigserial primary key,
  operacao_id uuid references public.operacoes (id),
  tipo text not null,
  entidade text not null,
  entidade_id uuid,
  ator uuid references auth.users (id),
  em timestamptz not null default now(),
  detalhe jsonb not null default '{}'::jsonb
);

create index auditoria_operacao_idx on public.auditoria (operacao_id, em desc);

comment on table public.auditoria is
  'Somente leitura para a aplicação. Escrita apenas pelas funções de domínio.';

-- -----------------------------------------------------------------------------
-- Bloqueio de exclusão de histórico financeiro
-- -----------------------------------------------------------------------------

create or replace function app.impedir_exclusao()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Histórico financeiro não pode ser excluído (tabela %).', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create trigger contratos_sem_exclusao before delete on public.contratos
  for each statement execute function app.impedir_exclusao();
create trigger parcelas_sem_exclusao before delete on public.parcelas
  for each statement execute function app.impedir_exclusao();
create trigger pagamentos_sem_exclusao before delete on public.pagamentos
  for each statement execute function app.impedir_exclusao();
create trigger alocacoes_sem_exclusao before delete on public.alocacoes_pagamento
  for each statement execute function app.impedir_exclusao();
create trigger estornos_sem_exclusao before delete on public.estornos_pagamento
  for each statement execute function app.impedir_exclusao();
create trigger auditoria_sem_exclusao before delete on public.auditoria
  for each statement execute function app.impedir_exclusao();
create trigger clientes_sem_exclusao before delete on public.clientes
  for each statement execute function app.impedir_exclusao();
