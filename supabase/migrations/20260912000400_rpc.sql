-- =============================================================================
-- 0004 — Escritas financeiras e projeções autorizadas
--
-- Toda função aqui é SECURITY DEFINER com `search_path` vazio e valida, no
-- corpo, três coisas antes de qualquer efeito: quem é o usuário, qual o papel
-- dele NA OPERAÇÃO informada, e se a sessão atingiu `aal2`.
--
-- Nenhuma função aceita valor em dinheiro, papel, data de registro ou total
-- vindos do navegador. Tudo o que é dinheiro é derivado do que já está gravado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Guardas
-- -----------------------------------------------------------------------------

create or replace function app.exigir_membro(p_operacao uuid)
returns app.papel_membro
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel app.papel_membro;
begin
  if auth.uid() is null then
    raise exception 'Sessão não autenticada.' using errcode = '28000';
  end if;
  if not app.tem_aal2() then
    raise exception 'Verificação em duas etapas exigida.' using errcode = '42501';
  end if;
  select m.papel into v_papel
    from public.membros_operacao m
   where m.operacao_id = p_operacao and m.usuario_id = auth.uid() and m.ativo;
  if v_papel is null then
    raise exception 'Sem vínculo ativo com esta operação.' using errcode = '42501';
  end if;
  return v_papel;
end;
$$;

create or replace function app.exigir_proprietario(p_operacao uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app.exigir_membro(p_operacao) <> 'proprietario' then
    raise exception 'Ação restrita ao proprietário da operação.' using errcode = '42501';
  end if;
end;
$$;

create or replace function app.registrar_auditoria(
  p_operacao uuid, p_tipo text, p_entidade text, p_entidade_id uuid, p_detalhe jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria (operacao_id, tipo, entidade, entidade_id, ator, detalhe)
  values (p_operacao, p_tipo, p_entidade, p_entidade_id, auth.uid(), coalesce(p_detalhe, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Provisionamento do proprietário
--
-- Chamado uma vez, depois do cadastro e da verificação em duas etapas. Cria uma
-- operação VAZIA — nenhum dado fictício entra em conta real. Idempotente: se o
-- usuário já é proprietário de alguma operação, devolve a existente.
-- -----------------------------------------------------------------------------

create or replace function public.provisionar_proprietario(p_nome_operacao text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_nome text;
  v_operacao uuid;
begin
  if v_uid is null then
    raise exception 'Sessão não autenticada.' using errcode = '28000';
  end if;
  if not app.tem_aal2() then
    raise exception 'Conclua a verificação em duas etapas antes de criar a operação.'
      using errcode = '42501';
  end if;

  select u.email, coalesce(u.raw_user_meta_data ->> 'nome', split_part(u.email, '@', 1))
    into v_email, v_nome
    from auth.users u where u.id = v_uid;

  insert into public.perfis (id, nome, email)
  values (v_uid, coalesce(nullif(btrim(v_nome), ''), 'Usuário'), v_email)
  on conflict (id) do update set email = excluded.email, atualizado_em = now();

  select m.operacao_id into v_operacao
    from public.membros_operacao m
   where m.usuario_id = v_uid and m.papel = 'proprietario' and m.ativo
   limit 1;

  if v_operacao is not null then
    return v_operacao;
  end if;

  insert into public.operacoes (nome, criado_por)
  values (coalesce(nullif(btrim(p_nome_operacao), ''), 'Minha operação'), v_uid)
  returning id into v_operacao;

  insert into public.membros_operacao (operacao_id, usuario_id, papel, criado_por)
  values (v_operacao, v_uid, 'proprietario', v_uid);

  insert into public.configuracoes_operacao (operacao_id, atualizado_por)
  values (v_operacao, v_uid);

  perform app.registrar_auditoria(v_operacao, 'operacao_criada', 'operacoes', v_operacao,
    jsonb_build_object('nome', p_nome_operacao));

  return v_operacao;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contrato + parcelas, atomicamente
-- -----------------------------------------------------------------------------

create or replace function public.criar_contrato(
  p_operacao uuid,
  p_cliente uuid,
  p_principal_cents bigint,
  p_taxa_percent numeric,
  p_frequencia app.frequencia_contrato,
  p_qtd_parcelas integer,
  p_primeiro_vencimento date,
  p_observacao text default null,
  p_chave_idempotencia text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contrato uuid;
  v_numero integer;
  v_juros bigint;
  v_total bigint;
  v_feriados text[];
  v_fuso text;
  v_regra app.regra_atraso;
  v_primeiro date;
  v_hoje date;
begin
  perform app.exigir_proprietario(p_operacao);

  if p_principal_cents is null or p_principal_cents <= 0 then
    raise exception 'Valor emprestado inválido.' using errcode = '22023';
  end if;
  if p_taxa_percent is null or p_taxa_percent < 0 then
    raise exception 'Porcentagem de juros inválida.' using errcode = '22023';
  end if;
  if p_qtd_parcelas is null or p_qtd_parcelas < 1 or p_qtd_parcelas > 400 then
    raise exception 'Quantidade de parcelas inválida.' using errcode = '22023';
  end if;
  if p_primeiro_vencimento is null then
    raise exception 'Primeiro vencimento é obrigatório.' using errcode = '22023';
  end if;

  -- O cliente precisa ser desta operação. A FK composta também garantiria,
  -- mas a mensagem daqui é a que o usuário entende.
  if not exists (
    select 1 from public.clientes c where c.id = p_cliente and c.operacao_id = p_operacao
  ) then
    raise exception 'Cliente não pertence a esta operação.' using errcode = '42501';
  end if;

  -- Reenvio após perda de conexão devolve o contrato já criado.
  if p_chave_idempotencia is not null then
    select a.entidade_id into v_contrato
      from public.auditoria a
     where a.operacao_id = p_operacao
       and a.tipo = 'contrato_criado'
       and a.detalhe ->> 'chave_idempotencia' = p_chave_idempotencia
     limit 1;
    if v_contrato is not null then
      return v_contrato;
    end if;
  end if;

  select s.feriados_ativos into v_feriados
    from public.configuracoes_operacao s where s.operacao_id = p_operacao;
  select o.fuso into v_fuso from public.operacoes o where o.id = p_operacao;
  v_regra := app.regra_atraso_para(p_frequencia);
  v_hoje := app.hoje_na_operacao(p_operacao);

  -- Um vencimento em domingo ou feriado é ajustado para o próximo dia de
  -- cobrança. A tela já explica o ajuste antes de salvar; aqui ele é aplicado
  -- de novo, porque o servidor é quem decide.
  v_primeiro := app.proximo_dia_permitido(p_primeiro_vencimento, v_feriados);

  v_juros := app.calcular_juros(p_principal_cents, p_taxa_percent);
  v_total := p_principal_cents + v_juros;

  select coalesce(max(c.numero), 0) + 1 into v_numero
    from public.contratos c where c.operacao_id = p_operacao;

  insert into public.contratos (
    operacao_id, cliente_id, numero, principal_cents, taxa_percent, juros_cents,
    total_cents, frequencia, qtd_parcelas, primeiro_vencimento, data_contrato,
    observacao, snapshot_feriados, snapshot_fuso, snapshot_regra_atraso, criado_por
  ) values (
    p_operacao, p_cliente, v_numero, p_principal_cents, p_taxa_percent, v_juros,
    v_total, p_frequencia, p_qtd_parcelas, v_primeiro, v_hoje,
    nullif(btrim(p_observacao), ''), v_feriados, v_fuso, v_regra, auth.uid()
  ) returning id into v_contrato;

  -- Parcelas: principal e juros repartidos separadamente, de modo que a soma
  -- das parcelas feche com o total, a dos principais com o principal e a dos
  -- juros com os juros.
  insert into public.parcelas (
    operacao_id, contrato_id, numero, vencimento, valor_cents, principal_cents, juros_cents
  )
  select
    p_operacao, v_contrato, v.numero, v.vencimento,
    pp.valor + jj.valor, pp.valor, jj.valor
  from app.gerar_vencimentos(p_frequencia, v_primeiro, p_qtd_parcelas, v_feriados) v
  join app.repartir(p_principal_cents, p_qtd_parcelas) pp on pp.indice = v.numero
  join app.repartir(v_juros, p_qtd_parcelas) jj on jj.indice = v.numero;

  perform app.registrar_auditoria(
    p_operacao, 'contrato_criado', 'contratos', v_contrato,
    jsonb_build_object(
      'numero', v_numero, 'principal_cents', p_principal_cents,
      'taxa_percent', p_taxa_percent, 'total_cents', v_total,
      'qtd_parcelas', p_qtd_parcelas, 'chave_idempotencia', p_chave_idempotencia
    )
  );

  return v_contrato;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pagamento de parcela
-- -----------------------------------------------------------------------------

create or replace function public.registrar_pagamento(
  p_operacao uuid,
  p_parcela uuid,
  p_data_pagamento date,
  p_chave_idempotencia text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagamento uuid;
  v_parcela public.parcelas;
  v_contrato public.contratos;
  v_acrescimo bigint;
  v_hoje date;
begin
  perform app.exigir_membro(p_operacao);

  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'Chave de idempotência é obrigatória.' using errcode = '22023';
  end if;

  -- Reenvio da mesma requisição devolve o lançamento original, sem duplicar.
  select pg.id into v_pagamento
    from public.pagamentos pg
   where pg.operacao_id = p_operacao and pg.chave_idempotencia = p_chave_idempotencia;
  if v_pagamento is not null then
    return v_pagamento;
  end if;

  -- Trava a parcela: duas sessões tentando pagar a mesma parcela serializam
  -- aqui, e a segunda encontra a alocação ativa da primeira.
  select * into v_parcela from public.parcelas pa
   where pa.id = p_parcela and pa.operacao_id = p_operacao
   for update;
  if not found then
    raise exception 'Parcela não encontrada nesta operação.' using errcode = '42501';
  end if;

  select * into v_contrato from public.contratos c where c.id = v_parcela.contrato_id;

  if exists (
    select 1 from public.alocacoes_pagamento a
     where a.parcela_id = v_parcela.id and not a.revogada
  ) then
    raise exception 'Esta parcela já consta como paga.' using errcode = '23505';
  end if;

  v_hoje := app.hoje_na_operacao(p_operacao);
  if p_data_pagamento is null then
    raise exception 'Data do pagamento é obrigatória.' using errcode = '22023';
  end if;
  if p_data_pagamento > v_hoje then
    raise exception 'Não é possível registrar pagamento com data futura.' using errcode = '22023';
  end if;
  if p_data_pagamento < v_contrato.data_contrato then
    raise exception 'Pagamento anterior ao início do contrato.' using errcode = '22023';
  end if;

  -- O valor é derivado do que está gravado, na data REAL do recebimento.
  -- Recebido no vencimento e digitado depois não ganha acréscimo.
  v_acrescimo := app.acrescimo_atraso(
    v_parcela.valor_cents, v_parcela.vencimento,
    v_contrato.snapshot_regra_atraso, p_data_pagamento
  );

  insert into public.pagamentos (
    operacao_id, contrato_id, data_pagamento, registrado_por,
    valor_original_cents, acrescimo_cents, valor_total_cents,
    tipo, regra_atraso_aplicada, chave_idempotencia
  ) values (
    p_operacao, v_contrato.id, p_data_pagamento, auth.uid(),
    v_parcela.valor_cents, v_acrescimo, v_parcela.valor_cents + v_acrescimo,
    'parcela', v_contrato.snapshot_regra_atraso, p_chave_idempotencia
  ) returning id into v_pagamento;

  insert into public.alocacoes_pagamento (
    operacao_id, pagamento_id, parcela_id, valor_original_cents, acrescimo_cents
  ) values (p_operacao, v_pagamento, v_parcela.id, v_parcela.valor_cents, v_acrescimo);

  perform app.registrar_auditoria(
    p_operacao, 'pagamento_registrado', 'pagamentos', v_pagamento,
    jsonb_build_object(
      'contrato_id', v_contrato.id, 'parcela_numero', v_parcela.numero,
      'data_pagamento', p_data_pagamento, 'valor_total_cents', v_parcela.valor_cents + v_acrescimo
    )
  );

  return v_pagamento;
end;
$$;

-- -----------------------------------------------------------------------------
-- Quitação antecipada
--
-- Cobra o saldo integral devido na data escolhida, sem desconto dos juros
-- contratuais. Parcelas já vencidas entram com o acréscimo; as ainda não
-- vencidas entram pelo valor original.
-- -----------------------------------------------------------------------------

create or replace function public.quitar_contrato(
  p_operacao uuid,
  p_contrato uuid,
  p_data_pagamento date,
  p_chave_idempotencia text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagamento uuid;
  v_contrato public.contratos;
  v_hoje date;
  v_original bigint := 0;
  v_acrescimo bigint := 0;
  v_qtd integer := 0;
  r record;
begin
  perform app.exigir_proprietario(p_operacao);

  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'Chave de idempotência é obrigatória.' using errcode = '22023';
  end if;

  select pg.id into v_pagamento
    from public.pagamentos pg
   where pg.operacao_id = p_operacao and pg.chave_idempotencia = p_chave_idempotencia;
  if v_pagamento is not null then
    return v_pagamento;
  end if;

  select * into v_contrato from public.contratos c
   where c.id = p_contrato and c.operacao_id = p_operacao;
  if not found then
    raise exception 'Contrato não encontrado nesta operação.' using errcode = '42501';
  end if;

  v_hoje := app.hoje_na_operacao(p_operacao);
  if p_data_pagamento > v_hoje then
    raise exception 'Não é possível registrar pagamento com data futura.' using errcode = '22023';
  end if;
  if p_data_pagamento < v_contrato.data_contrato then
    raise exception 'Pagamento anterior ao início do contrato.' using errcode = '22023';
  end if;

  create temporary table _quitacao_parcelas on commit drop as
  select pa.id, pa.numero, pa.valor_cents,
         app.acrescimo_atraso(pa.valor_cents, pa.vencimento,
           v_contrato.snapshot_regra_atraso, p_data_pagamento) as acrescimo
    from public.parcelas pa
   where pa.contrato_id = p_contrato
     and not exists (
       select 1 from public.alocacoes_pagamento a
        where a.parcela_id = pa.id and not a.revogada
     )
   order by pa.numero
   for update;

  select count(*), coalesce(sum(valor_cents), 0), coalesce(sum(acrescimo), 0)
    into v_qtd, v_original, v_acrescimo
    from _quitacao_parcelas;

  if v_qtd = 0 then
    raise exception 'Contrato já está quitado.' using errcode = '23505';
  end if;

  insert into public.pagamentos (
    operacao_id, contrato_id, data_pagamento, registrado_por,
    valor_original_cents, acrescimo_cents, valor_total_cents,
    tipo, regra_atraso_aplicada, chave_idempotencia
  ) values (
    p_operacao, p_contrato, p_data_pagamento, auth.uid(),
    v_original, v_acrescimo, v_original + v_acrescimo,
    'quitacao', v_contrato.snapshot_regra_atraso, p_chave_idempotencia
  ) returning id into v_pagamento;

  -- A composição por parcela é preservada, não só o total.
  for r in select * from _quitacao_parcelas loop
    insert into public.alocacoes_pagamento (
      operacao_id, pagamento_id, parcela_id, valor_original_cents, acrescimo_cents
    ) values (p_operacao, v_pagamento, r.id, r.valor_cents, r.acrescimo);
  end loop;

  perform app.registrar_auditoria(
    p_operacao, 'quitacao_registrada', 'pagamentos', v_pagamento,
    jsonb_build_object('contrato_id', p_contrato, 'parcelas', v_qtd,
      'valor_total_cents', v_original + v_acrescimo, 'data_pagamento', p_data_pagamento)
  );

  return v_pagamento;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reversão
--
-- O lançamento original é preservado. A reversão é um evento novo, com motivo,
-- autor e horário, e devolve as parcelas ao estado em aberto — podendo depois
-- receber um novo pagamento válido.
-- -----------------------------------------------------------------------------

create or replace function public.reverter_pagamento(
  p_operacao uuid,
  p_pagamento uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estorno uuid;
  v_pagamento public.pagamentos;
begin
  perform app.exigir_proprietario(p_operacao);

  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'Informe o motivo da correção.' using errcode = '22023';
  end if;

  select * into v_pagamento from public.pagamentos pg
   where pg.id = p_pagamento and pg.operacao_id = p_operacao
   for update;
  if not found then
    raise exception 'Pagamento não encontrado nesta operação.' using errcode = '42501';
  end if;

  -- Reversão duplicada não passa: a coluna já está preenchida e a tabela de
  -- estornos tem UNIQUE(pagamento_id).
  if v_pagamento.estornado_em is not null then
    raise exception 'Este pagamento já foi desfeito.' using errcode = '23505';
  end if;

  update public.pagamentos
     set estornado_em = now(), estornado_por = auth.uid()
   where id = p_pagamento;

  insert into public.estornos_pagamento (operacao_id, pagamento_id, motivo, criado_por)
  values (p_operacao, p_pagamento, btrim(p_motivo), auth.uid())
  returning id into v_estorno;

  perform app.registrar_auditoria(
    p_operacao, 'pagamento_estornado', 'pagamentos', p_pagamento,
    jsonb_build_object('motivo', btrim(p_motivo), 'estorno_id', v_estorno,
      'valor_total_cents', v_pagamento.valor_total_cents)
  );

  return v_estorno;
end;
$$;

-- -----------------------------------------------------------------------------
-- Convite de assistente
-- -----------------------------------------------------------------------------

create or replace function public.criar_convite(p_operacao uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid;
begin
  perform app.exigir_proprietario(p_operacao);

  if p_email is null or position('@' in p_email) < 2 then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  -- Convite pendente anterior para o mesmo e-mail é revogado, para que o
  -- índice único parcial aceite o novo.
  update public.convites
     set revogado_em = now(), revogado_por = auth.uid()
   where operacao_id = p_operacao
     and lower(email) = lower(btrim(p_email))
     and aceito_em is null and revogado_em is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.convites (operacao_id, email, papel, token_hash, expira_em, criado_por)
  values (
    p_operacao, lower(btrim(p_email)), 'assistente',
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '7 days', auth.uid()
  ) returning id into v_id;

  perform app.registrar_auditoria(p_operacao, 'convite_criado', 'convites', v_id,
    jsonb_build_object('email', lower(btrim(p_email))));

  -- O token em claro é devolvido uma única vez, para montar o link. O banco
  -- guarda apenas o hash.
  return v_token;
end;
$$;

create or replace function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.convites;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sessão não autenticada.' using errcode = '28000';
  end if;
  if not app.tem_aal2() then
    raise exception 'Conclua a verificação em duas etapas antes de aceitar o convite.'
      using errcode = '42501';
  end if;

  select * into v_convite from public.convites c
   where c.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    raise exception 'Convite inválido.' using errcode = '42501';
  end if;
  if v_convite.aceito_em is not null or v_convite.revogado_em is not null then
    raise exception 'Convite já utilizado ou revogado.' using errcode = '42501';
  end if;
  if v_convite.expira_em < now() then
    raise exception 'Convite expirado.' using errcode = '42501';
  end if;

  select u.email into v_email from auth.users u where u.id = auth.uid();

  -- Só o destinatário autenticado aceita. O papel vem do convite; quem aceita
  -- não escolhe nem aumenta o próprio papel.
  if lower(coalesce(v_email, '')) <> lower(v_convite.email) then
    raise exception 'Este convite é de outro destinatário.' using errcode = '42501';
  end if;

  insert into public.perfis (id, nome, email)
  values (auth.uid(), coalesce(split_part(v_email, '@', 1), 'Assistente'), v_email)
  on conflict (id) do nothing;

  insert into public.membros_operacao (operacao_id, usuario_id, papel, criado_por)
  values (v_convite.operacao_id, auth.uid(), v_convite.papel, v_convite.criado_por)
  on conflict (operacao_id, usuario_id) do update
    set papel = excluded.papel, ativo = true, revogado_em = null, revogado_por = null;

  update public.convites
     set aceito_em = now(), aceito_por = auth.uid()
   where id = v_convite.id;

  perform app.registrar_auditoria(v_convite.operacao_id, 'convite_aceito', 'convites',
    v_convite.id, jsonb_build_object('usuario', auth.uid()));

  return v_convite.operacao_id;
end;
$$;

create or replace function public.revogar_membro(p_operacao uuid, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.exigir_proprietario(p_operacao);

  if p_usuario = auth.uid() then
    raise exception 'O proprietário não pode revogar o próprio acesso.' using errcode = '42501';
  end if;

  update public.membros_operacao
     set ativo = false, revogado_em = now(), revogado_por = auth.uid()
   where operacao_id = p_operacao and usuario_id = p_usuario and ativo;

  if not found then
    raise exception 'Membro não encontrado nesta operação.' using errcode = '42501';
  end if;

  perform app.registrar_auditoria(p_operacao, 'membro_revogado', 'membros_operacao',
    p_usuario, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Projeções autorizadas
--
-- RLS filtra linhas; ela não esconde colunas. Estas funções existem para que o
-- assistente receba apenas o necessário para cobrar — sem principal, juros,
-- taxa ou totais da carteira.
-- -----------------------------------------------------------------------------

create or replace function public.listar_vencimentos(
  p_operacao uuid,
  p_filtro text default 'hoje',
  p_busca text default null
)
returns table (
  parcela_id uuid,
  contrato_id uuid,
  cliente_id uuid,
  cliente_nome text,
  cliente_telefone text,
  contrato_numero integer,
  parcela_numero integer,
  qtd_parcelas integer,
  vencimento date,
  data_contrato date,
  situacao text,
  valor_original_cents bigint,
  acrescimo_cents bigint,
  total_devido_cents bigint,
  dias_de_atraso integer,
  data_pagamento date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  perform app.exigir_membro(p_operacao);
  v_hoje := app.hoje_na_operacao(p_operacao);

  return query
  with base as (
    select
      pa.id as parcela_id, c.id as contrato_id, cl.id as cliente_id,
      cl.nome as cliente_nome, cl.telefone as cliente_telefone,
      c.numero as contrato_numero, pa.numero as parcela_numero,
      c.qtd_parcelas, pa.vencimento, c.data_contrato, pa.valor_cents,
      c.snapshot_regra_atraso,
      al.id as alocacao_id, al.acrescimo_cents as acrescimo_pago, pg.data_pagamento
    from public.parcelas pa
    join public.contratos c on c.id = pa.contrato_id
    join public.clientes cl on cl.id = c.cliente_id
    left join public.alocacoes_pagamento al
      on al.parcela_id = pa.id and not al.revogada
    left join public.pagamentos pg on pg.id = al.pagamento_id
   where pa.operacao_id = p_operacao
  ), avaliada as (
    select
      b.*,
      case
        when b.alocacao_id is not null then 'paga'
        when b.vencimento < v_hoje then 'atrasada'
        when b.vencimento = v_hoje then 'hoje'
        else 'a_vencer'
      end as situacao,
      case
        when b.alocacao_id is not null then b.acrescimo_pago::bigint
        else app.acrescimo_atraso(b.valor_cents, b.vencimento, b.snapshot_regra_atraso, v_hoje)
      end as acrescimo
    from base b
  )
  select
    a.parcela_id, a.contrato_id, a.cliente_id, a.cliente_nome, a.cliente_telefone,
    a.contrato_numero, a.parcela_numero, a.qtd_parcelas, a.vencimento, a.data_contrato,
    a.situacao,
    a.valor_cents::bigint, a.acrescimo::bigint, (a.valor_cents + a.acrescimo)::bigint,
    case when a.situacao = 'atrasada' then (v_hoje - a.vencimento)::integer else 0 end,
    a.data_pagamento
  from avaliada a
  where (
      (p_filtro = 'hoje'      and a.situacao = 'hoje')
   or (p_filtro = 'atrasados' and a.situacao = 'atrasada')
   or (p_filtro = 'proximos'  and a.situacao = 'a_vencer')
   or (p_filtro = 'pagos'     and a.situacao = 'paga')
   or (p_filtro = 'todos')
  )
  and (
      v_busca is null
   or a.cliente_nome ilike '%' || v_busca || '%'
   or regexp_replace(a.cliente_telefone, '\D', '', 'g')
        like '%' || regexp_replace(v_busca, '\D', '', 'g') || '%'
   or a.contrato_numero::text = v_busca
  )
  -- Atrasados do vencimento mais antigo para o mais recente; pagos, do
  -- recebimento mais recente para o mais antigo.
  order by
    case when p_filtro = 'pagos' then a.data_pagamento end desc nulls last,
    case when p_filtro <> 'pagos' then a.vencimento end asc nulls last,
    a.cliente_nome;
end;
$$;

-- Dados de uma parcela para o painel de pagamento. Serve aos dois papéis e não
-- expõe composição nem totais do contrato.
create or replace function public.parcela_para_cobranca(p_operacao uuid, p_parcela uuid)
returns table (
  parcela_id uuid,
  contrato_id uuid,
  cliente_nome text,
  contrato_numero integer,
  parcela_numero integer,
  qtd_parcelas integer,
  vencimento date,
  data_contrato date,
  valor_original_cents bigint,
  acrescimo_hoje_cents bigint,
  regra_atraso app.regra_atraso,
  hoje date,
  ja_paga boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date;
begin
  perform app.exigir_membro(p_operacao);
  v_hoje := app.hoje_na_operacao(p_operacao);

  return query
  select
    pa.id, c.id, cl.nome, c.numero, pa.numero, c.qtd_parcelas, pa.vencimento,
    c.data_contrato, pa.valor_cents::bigint,
    app.acrescimo_atraso(pa.valor_cents, pa.vencimento, c.snapshot_regra_atraso, v_hoje),
    c.snapshot_regra_atraso, v_hoje,
    exists (select 1 from public.alocacoes_pagamento a
             where a.parcela_id = pa.id and not a.revogada)
  from public.parcelas pa
  join public.contratos c on c.id = pa.contrato_id
  join public.clientes cl on cl.id = c.cliente_id
  where pa.id = p_parcela and pa.operacao_id = p_operacao;
end;
$$;

-- Valor devido de uma parcela numa data escolhida — usado para mostrar o
-- recálculo quando o recebimento foi retroativo.
create or replace function public.valor_devido_em(
  p_operacao uuid, p_parcela uuid, p_data date
)
returns table (valor_original_cents bigint, acrescimo_cents bigint, total_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.exigir_membro(p_operacao);
  return query
  select pa.valor_cents::bigint,
         app.acrescimo_atraso(pa.valor_cents, pa.vencimento, c.snapshot_regra_atraso, p_data),
         (pa.valor_cents + app.acrescimo_atraso(pa.valor_cents, pa.vencimento,
           c.snapshot_regra_atraso, p_data))::bigint
    from public.parcelas pa
    join public.contratos c on c.id = pa.contrato_id
   where pa.id = p_parcela and pa.operacao_id = p_operacao;
end;
$$;

-- Data corrente da operação, segundo o servidor. Qualquer membro pode ler: é o
-- que a tela usa como "hoje", em vez do relógio do dispositivo.
create or replace function public.data_da_operacao(p_operacao uuid)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.exigir_membro(p_operacao);
  return app.hoje_na_operacao(p_operacao);
end;
$$;

-- Indicadores da carteira. Restritos ao proprietário — esconder cartão na tela
-- não é proteção, então a função recusa o assistente.
create or replace function public.indicadores(p_operacao uuid)
returns table (
  data_referencia date,
  recebido_hoje_cents bigint,
  qtd_recebimentos_hoje integer,
  pendente_hoje_cents bigint,
  qtd_pendentes_hoje integer,
  total_atrasado_cents bigint,
  qtd_atrasadas integer,
  principal_em_aberto_cents bigint,
  juros_em_aberto_cents bigint,
  acrescimos_em_aberto_cents bigint,
  total_a_receber_cents bigint,
  contratos_abertos integer,
  contratos_atrasados integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date;
begin
  perform app.exigir_proprietario(p_operacao);
  v_hoje := app.hoje_na_operacao(p_operacao);

  return query
  with aberto as (
    select pa.contrato_id, pa.vencimento, pa.valor_cents, pa.principal_cents, pa.juros_cents,
           app.acrescimo_atraso(pa.valor_cents, pa.vencimento, c.snapshot_regra_atraso, v_hoje) as acrescimo
      from public.parcelas pa
      join public.contratos c on c.id = pa.contrato_id
     where pa.operacao_id = p_operacao
       and not exists (select 1 from public.alocacoes_pagamento a
                        where a.parcela_id = pa.id and not a.revogada)
  ), recebido as (
    select coalesce(sum(pg.valor_total_cents), 0)::bigint as total, count(*)::integer as qtd
      from public.pagamentos pg
     where pg.operacao_id = p_operacao
       and pg.estornado_em is null
       and pg.data_pagamento = v_hoje
  ), contratos_estado as (
    select c.id,
           bool_or(ab.vencimento < v_hoje) as tem_atraso,
           count(ab.*) as abertas
      from public.contratos c
      left join aberto ab on ab.contrato_id = c.id
     where c.operacao_id = p_operacao
     group by c.id
  )
  select
    v_hoje,
    (select total from recebido),
    (select qtd from recebido),
    coalesce(sum(a.valor_cents + a.acrescimo) filter (where a.vencimento = v_hoje), 0)::bigint,
    count(*) filter (where a.vencimento = v_hoje)::integer,
    coalesce(sum(a.valor_cents + a.acrescimo) filter (where a.vencimento < v_hoje), 0)::bigint,
    count(*) filter (where a.vencimento < v_hoje)::integer,
    coalesce(sum(a.principal_cents), 0)::bigint,
    coalesce(sum(a.juros_cents), 0)::bigint,
    coalesce(sum(a.acrescimo), 0)::bigint,
    coalesce(sum(a.valor_cents + a.acrescimo), 0)::bigint,
    (select count(*) from contratos_estado where abertas > 0)::integer,
    (select count(*) from contratos_estado where tem_atraso)::integer
  from aberto a;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios de execução
--
-- As funções SECURITY DEFINER de apoio rodam como dono do esquema e, por isso,
-- passam por cima da RLS. Nenhuma delas pode ficar ao alcance direto do
-- usuário: `registrar_auditoria` escreveria linhas de auditoria forjadas, e as
-- guardas só fazem sentido chamadas de dentro das funções públicas.
-- -----------------------------------------------------------------------------

revoke execute on function
  app.registrar_auditoria(uuid, text, text, uuid, jsonb),
  app.exigir_membro(uuid),
  app.exigir_proprietario(uuid)
from public, anon, authenticated;

revoke execute on function
  public.provisionar_proprietario(text),
  public.criar_contrato(uuid, uuid, bigint, numeric, app.frequencia_contrato, integer, date, text, text),
  public.registrar_pagamento(uuid, uuid, date, text),
  public.quitar_contrato(uuid, uuid, date, text),
  public.reverter_pagamento(uuid, uuid, text),
  public.criar_convite(uuid, text),
  public.aceitar_convite(text),
  public.revogar_membro(uuid, uuid),
  public.listar_vencimentos(uuid, text, text),
  public.parcela_para_cobranca(uuid, uuid),
  public.valor_devido_em(uuid, uuid, date),
  public.data_da_operacao(uuid),
  public.indicadores(uuid)
from public, anon;

grant execute on function
  public.provisionar_proprietario(text),
  public.criar_contrato(uuid, uuid, bigint, numeric, app.frequencia_contrato, integer, date, text, text),
  public.registrar_pagamento(uuid, uuid, date, text),
  public.quitar_contrato(uuid, uuid, date, text),
  public.reverter_pagamento(uuid, uuid, text),
  public.criar_convite(uuid, text),
  public.aceitar_convite(text),
  public.revogar_membro(uuid, uuid),
  public.listar_vencimentos(uuid, text, text),
  public.parcela_para_cobranca(uuid, uuid),
  public.valor_devido_em(uuid, uuid, date),
  public.data_da_operacao(uuid),
  public.indicadores(uuid)
to authenticated;
