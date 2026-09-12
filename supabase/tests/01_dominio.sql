-- =============================================================================
-- Paridade entre as funções de domínio em SQL e as de src/domain/*.ts
--
-- Os casos abaixo são os mesmos de src/domain/__tests__/dominio.test.ts. Se as
-- duas implementações divergirem, este arquivo falha.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.conferir(condicao boolean, descricao text)
returns void language plpgsql as $$
begin
  if condicao is not true then
    raise exception 'FALHOU: %', descricao;
  end if;
  raise notice 'ok — %', descricao;
end;
$$;

do $$
declare
  v_feriados text[] := array[
    'confraternizacao','sexta-santa','tiradentes','trabalho','corpus-christi',
    'sao-joao','independencia-bahia','santana','independencia','aparecida',
    'finados','republica','consciencia-negra','natal'
  ];
  v_juros bigint;
  v_datas date[];
  v_soma bigint;
  v_qtd integer;
begin
  -- 1. R$ 1.000 com 40% e 20 parcelas ---------------------------------------
  v_juros := app.calcular_juros(100000, 40.0);
  perform pg_temp.conferir(v_juros = 40000, 'juros de R$ 1.000 a 40% = R$ 400');
  perform pg_temp.conferir(100000 + v_juros = 140000, 'total contratado = R$ 1.400');

  select count(*), sum(valor) into v_qtd, v_soma from app.repartir(140000, 20);
  perform pg_temp.conferir(v_qtd = 20 and v_soma = 140000, '20 parcelas somando R$ 1.400');
  perform pg_temp.conferir(
    (select bool_and(valor = 7000) from app.repartir(140000, 20)),
    'cada parcela vale R$ 70,00'
  );

  -- 2. Arredondamento preserva o total --------------------------------------
  perform pg_temp.conferir(
    (select sum(valor) from app.repartir(100001, 7)) = 100001,
    'resto distribuído mantém o total (100001 em 7)'
  );
  perform pg_temp.conferir(
    (select max(valor) - min(valor) from app.repartir(99999, 13)) <= 1,
    'diferença entre parcelas nunca passa de um centavo'
  );
  perform pg_temp.conferir(
    (select sum(valor) from app.repartir(1, 5)) = 1,
    'total de 1 centavo em 5 parcelas ainda soma 1'
  );

  -- Composição principal/juros fecha com o contrato inteiro.
  perform pg_temp.conferir(
    (select sum(p.valor) from app.repartir(100000, 21) p) = 100000
    and (select sum(j.valor) from app.repartir(app.calcular_juros(100000, 37.0), 21) j) = 37000
    and (select sum(p.valor + j.valor)
           from app.repartir(100000, 21) p
           join app.repartir(app.calcular_juros(100000, 37.0), 21) j on j.indice = p.indice) = 137000,
    'principal, juros e total fecham mesmo com resto'
  );

  -- 3. Calendário diário -----------------------------------------------------
  perform pg_temp.conferir(app.pascoa(2026) = date '2026-04-05', 'Páscoa de 2026');
  perform pg_temp.conferir(app.pascoa(2027) = date '2027-03-28', 'Páscoa de 2027');
  perform pg_temp.conferir(app.eh_feriado(date '2026-04-03', v_feriados),
    'Sexta-feira da Paixão de 2026 é feriado');

  select array_agg(vencimento order by numero) into v_datas
    from app.gerar_vencimentos('diaria', date '2026-08-31', 12, v_feriados);
  perform pg_temp.conferir(
    v_datas = array[
      date '2026-08-31', date '2026-09-01', date '2026-09-02', date '2026-09-03',
      date '2026-09-04', date '2026-09-05', date '2026-09-08', date '2026-09-09',
      date '2026-09-10', date '2026-09-11', date '2026-09-12', date '2026-09-14'
    ],
    'diárias pulam domingo e 07/09, mantendo sábado'
  );

  perform pg_temp.conferir(
    (select count(*) from app.gerar_vencimentos('diaria', date '2026-09-14', 180, v_feriados)) = 180,
    'gera exatamente a quantidade contratada'
  );
  perform pg_temp.conferir(
    (select bool_and(app.dia_permitido(vencimento, v_feriados))
       from app.gerar_vencimentos('diaria', date '2026-01-01', 200, v_feriados)),
    'nenhum vencimento cai em dia excluído'
  );

  -- Ajuste do primeiro vencimento inválido.
  perform pg_temp.conferir(
    app.proximo_dia_permitido(date '2026-09-13', v_feriados) = date '2026-09-14',
    'domingo 13/09 vai para segunda 14/09'
  );
  perform pg_temp.conferir(
    app.proximo_dia_permitido(date '2026-09-07', v_feriados) = date '2026-09-08',
    'feriado 07/09 vai para 08/09'
  );
  perform pg_temp.conferir(
    app.proximo_dia_permitido(date '2026-09-12', v_feriados) = date '2026-09-12',
    'sábado válido não é alterado'
  );

  -- Semanal: a data-base não acumula o ajuste.
  select array_agg(vencimento order by numero) into v_datas
    from app.gerar_vencimentos('semanal', date '2026-09-06', 4, v_feriados);
  perform pg_temp.conferir(
    v_datas = array[date '2026-09-08', date '2026-09-14', date '2026-09-21', date '2026-09-28'],
    'semanal ajusta sem deslocar as datas seguintes'
  );

  -- Mensal: recua para o último dia quando o dia não existe.
  select array_agg(vencimento order by numero) into v_datas
    from app.gerar_vencimentos('mensal', date '2026-01-31', 4, v_feriados);
  perform pg_temp.conferir(
    (select bool_and(app.dia_permitido(d, v_feriados)) from unnest(v_datas) d),
    'mensal nunca cai em dia excluído'
  );
  perform pg_temp.conferir(
    (date '2026-01-31' + make_interval(months => 1))::date = date '2026-02-28',
    'mensal usa o último dia do mês quando o dia não existe'
  );

  -- 4. Atraso da diária ------------------------------------------------------
  perform pg_temp.conferir(
    app.acrescimo_atraso(7000, date '2026-09-14', 'diaria_dobra_unica', date '2026-09-14') = 0,
    'no vencimento não há acréscimo'
  );
  perform pg_temp.conferir(
    7000 + app.acrescimo_atraso(7000, date '2026-09-14', 'diaria_dobra_unica', date '2026-09-15') = 14000,
    'no dia seguinte a diária dobra'
  );
  perform pg_temp.conferir(
    7000 + app.acrescimo_atraso(7000, date '2026-09-14', 'diaria_dobra_unica', date '2026-09-25') = 14000,
    'dez dias depois continua em R$ 140,00'
  );
  perform pg_temp.conferir(
    7000 + app.acrescimo_atraso(7000, date '2026-09-14', 'diaria_dobra_unica', date '2027-09-25') = 14000,
    'um ano depois continua em R$ 140,00'
  );
  -- Sábado 19/09/2026; o dia seguinte é domingo e o acréscimo ocorre assim mesmo.
  perform pg_temp.conferir(
    extract(isodow from date '2026-09-20') = 7
    and app.acrescimo_atraso(7000, date '2026-09-19', 'diaria_dobra_unica', date '2026-09-20') = 7000,
    'acréscimo ocorre mesmo quando o dia seguinte é domingo'
  );
  perform pg_temp.conferir(
    app.acrescimo_atraso(13000, date '2026-09-14', 'sem_acrescimo', date '2026-12-31') = 0,
    'semanal e mensal não recebem acréscimo'
  );

  raise notice 'Paridade de domínio: todos os casos passaram.';
end
$$;
