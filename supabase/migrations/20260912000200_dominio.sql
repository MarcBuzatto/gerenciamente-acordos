-- =============================================================================
-- 0002 — Funções de domínio (espelho de src/domain)
--
-- O navegador calcula prévias; o servidor determina os valores definitivos.
-- Para isso as regras financeiras e de calendário existem também aqui, em SQL.
--
-- A correspondência entre estas funções e as de `src/domain/*.ts` é verificada
-- por teste (supabase/tests/02_dominio_paridade.sql confere os mesmos casos que
-- src/domain/__tests__/dominio.test.ts).
--
-- Todas as funções são IMMUTABLE/STABLE e não leem tabelas de usuário, portanto
-- não precisam de SECURITY DEFINER.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Feriados
-- -----------------------------------------------------------------------------

-- Domingo de Páscoa pelo algoritmo de Meeus/Butcher (calendário gregoriano).
create or replace function app.pascoa(ano integer)
returns date
language plpgsql
immutable
as $$
declare
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
  mes int; dia int;
begin
  a := ano % 19;
  b := ano / 100;
  c := ano % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31;
  dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(ano, mes, dia);
end;
$$;

-- Catálogo de regras de feriado. Os identificadores são os mesmos de
-- src/domain/feriados.ts. A procedência de cada um está documentada lá e na
-- tela "Regras e pendências"; aqui só interessa a data.
create or replace function app.regras_feriado()
returns table (id text, tipo text, mes_dia text, offset_pascoa integer)
language sql
immutable
as $$
  values
    ('confraternizacao',     'fixo',  '01-01', null),
    ('sexta-santa',          'movel', null,    -2),
    ('tiradentes',           'fixo',  '04-21', null),
    ('trabalho',             'fixo',  '05-01', null),
    ('corpus-christi',       'movel', null,    60),
    ('sao-joao',             'fixo',  '06-24', null),
    ('independencia-bahia',  'fixo',  '07-02', null),
    ('santana',              'fixo',  '07-26', null),
    ('independencia',        'fixo',  '09-07', null),
    ('aparecida',            'fixo',  '10-12', null),
    ('finados',              'fixo',  '11-02', null),
    ('republica',            'fixo',  '11-15', null),
    ('consciencia-negra',    'fixo',  '11-20', null),
    ('natal',                'fixo',  '12-25', null),
    ('carnaval',             'movel', null,    -47),
    ('cinzas',               'movel', null,    -46)
$$;

create or replace function app.feriados_do_ano(ano integer, ids text[])
returns table (data date, regra_id text)
language sql
immutable
as $$
  select
    case
      when r.tipo = 'fixo' then to_date(ano::text || '-' || r.mes_dia, 'YYYY-MM-DD')
      else app.pascoa(ano) + r.offset_pascoa
    end as data,
    r.id
  from app.regras_feriado() r
  where r.id = any(ids);
$$;

create or replace function app.eh_feriado(d date, ids text[])
returns boolean
language sql
immutable
as $$
  -- Um feriado móvel do ano seguinte (ou anterior) nunca cai fora da janela de
  -- um ano, mas checar os três anos deixa a função correta nas bordas.
  select exists (
    select 1
      from generate_series(extract(year from d)::int - 1, extract(year from d)::int + 1) as y
      cross join lateral app.feriados_do_ano(y::int, ids) f
     where f.data = d
  );
$$;

-- Dia de cobrança: segunda a sábado, exceto feriados aplicáveis à operação.
create or replace function app.dia_permitido(d date, ids text[])
returns boolean
language sql
immutable
as $$
  select extract(isodow from d) <> 7 and not app.eh_feriado(d, ids);
$$;

create or replace function app.proximo_dia_permitido(d date, ids text[])
returns date
language plpgsql
immutable
as $$
declare
  atual date := d;
  i int := 0;
begin
  while not app.dia_permitido(atual, ids) loop
    atual := atual + 1;
    i := i + 1;
    if i > 400 then
      raise exception 'Não foi possível encontrar dia de cobrança a partir de %', d;
    end if;
  end loop;
  return atual;
end;
$$;

-- -----------------------------------------------------------------------------
-- Calendário de vencimentos
--
-- CONFIRMADO (diária): segunda a sábado, domingo e feriado não contam, e a
-- quantidade contratada de parcelas é sempre gerada.
--
-- PROVISÓRIO (semanal e mensal): intervalos de sete dias / mesmo dia do mês com
-- recuo para o último dia quando não existe; vencimento em dia excluído avança
-- para o próximo permitido, e o ajuste não desloca as datas seguintes.
-- -----------------------------------------------------------------------------

create or replace function app.gerar_vencimentos(
  frequencia app.frequencia_contrato,
  primeiro_vencimento date,
  qtd_parcelas integer,
  feriados text[]
)
returns table (numero integer, vencimento date)
language plpgsql
immutable
as $$
declare
  cursor_data date;
  base_data date;
  i int;
begin
  if qtd_parcelas < 1 then
    return;
  end if;

  if frequencia = 'diaria' then
    cursor_data := app.proximo_dia_permitido(primeiro_vencimento, feriados);
    for i in 1..qtd_parcelas loop
      numero := i;
      vencimento := cursor_data;
      return next;
      cursor_data := app.proximo_dia_permitido(cursor_data + 1, feriados);
    end loop;
    return;
  end if;

  for i in 1..qtd_parcelas loop
    if frequencia = 'semanal' then
      base_data := primeiro_vencimento + (7 * (i - 1));
    else
      -- Postgres já recua para o último dia do mês quando o dia não existe.
      base_data := (primeiro_vencimento + make_interval(months => i - 1))::date;
    end if;
    numero := i;
    vencimento := app.proximo_dia_permitido(base_data, feriados);
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Dinheiro
-- -----------------------------------------------------------------------------

-- Reparte um total inteiro em `quantidade` partes que somam exatamente o total:
-- divisão inteira e resto distribuído de um em um centavo nas primeiras partes.
create or replace function app.repartir(total bigint, quantidade integer)
returns table (indice integer, valor bigint)
language sql
immutable
as $$
  select
    g::integer,
    (total / quantidade) + case when g <= (total - (total / quantidade) * quantidade) then 1 else 0 end
  from generate_series(1, quantidade) g
  where quantidade > 0;
$$;

-- Juros contratuais: a taxa incide uma única vez sobre o principal, para o
-- contrato inteiro. Arredondamento meio-para-cima, igual a Math.round no TS
-- para valores positivos.
create or replace function app.calcular_juros(principal_cents bigint, taxa_percent numeric)
returns bigint
language sql
immutable
as $$
  select floor((principal_cents * taxa_percent) / 100.0 + 0.5)::bigint;
$$;

-- -----------------------------------------------------------------------------
-- Atraso
--
-- CONFIRMADO (diária): a parcela não paga dobra uma única vez, no dia seguinte
-- ao vencimento, e depois fica congelada. Cada parcela é tratada isoladamente.
-- O acréscimo ocorre inclusive quando o dia seguinte é domingo ou feriado.
--
-- PENDENTE (semanal e mensal): sem acréscimo — apenas identificação do atraso.
-- -----------------------------------------------------------------------------

create or replace function app.acrescimo_atraso(
  valor_cents bigint,
  vencimento date,
  regra app.regra_atraso,
  em_data date
)
returns bigint
language sql
immutable
as $$
  select case
    when regra = 'diaria_dobra_unica' and em_data > vencimento then valor_cents
    else 0::bigint
  end;
$$;

create or replace function app.regra_atraso_para(frequencia app.frequencia_contrato)
returns app.regra_atraso
language sql
immutable
as $$
  select case when frequencia = 'diaria' then 'diaria_dobra_unica'::app.regra_atraso
              else 'sem_acrescimo'::app.regra_atraso end;
$$;

-- -----------------------------------------------------------------------------
-- Data corrente da operação
--
-- A data de uma transação é validada pelo servidor, nunca pelo relógio do
-- dispositivo. Cada operação tem seu fuso; a data civil sai dele.
-- -----------------------------------------------------------------------------

create or replace function app.hoje_na_operacao(operacao uuid)
returns date
language sql
stable
as $$
  select (now() at time zone coalesce(
    (select o.fuso from public.operacoes o where o.id = operacao),
    'America/Bahia'
  ))::date;
$$;
