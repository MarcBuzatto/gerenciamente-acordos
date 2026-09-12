import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import {
  URL_BANCO,
  Sessao,
  bancoDisponivel,
  cents,
  comAdmin,
  criarUsuario,
  limparDados,
} from './ajuda'

/**
 * Testes de integração: isolamento entre operações, permissões por papel e
 * integridade das escritas financeiras.
 *
 * Tudo aqui bate direto na API do banco (tabelas e RPC), sem passar pela
 * interface — é essa a superfície que um cliente hostil alcançaria.
 *
 * Exigem um PostgreSQL com as migrações aplicadas:
 *   ./scripts/db-local.sh
 * Sem banco, a suíte é pulada com aviso, para o CI continuar verde sem segredo.
 */

const temBanco = await bancoDisponivel()

const FERIADOS_PADRAO = [
  'confraternizacao', 'sexta-santa', 'tiradentes', 'trabalho', 'corpus-christi',
  'sao-joao', 'independencia-bahia', 'santana', 'independencia', 'aparecida',
  'finados', 'republica', 'consciencia-negra', 'natal',
]

describe.skipIf(!temBanco)('integração com o banco', () => {
  let idA1 = '', idA2 = '', idB1 = '', idC = ''
  let opA = '', opB = ''
  let clienteA = '', contratoA = ''
  let propA: Sessao, assistA: Sessao, propB: Sessao, semVinculo: Sessao, anonimo: Sessao
  let hoje = ''

  /** Parcelas do contrato de teste, em ordem. */
  let parcelas: { id: string; numero: number; vencimento: string; valor: number }[] = []

  beforeAll(async () => {
    await limparDados()

    idA1 = await criarUsuario('prop.a@exemplo.test', 'Proprietária A')
    idA2 = await criarUsuario('assist.a@exemplo.test', 'Assistente A')
    idB1 = await criarUsuario('prop.b@exemplo.test', 'Proprietário B')
    idC = await criarUsuario('sem.vinculo@exemplo.test', 'Sem Vínculo')

    propA = await Sessao.abrir('authenticated', { sub: idA1, email: 'prop.a@exemplo.test' })
    assistA = await Sessao.abrir('authenticated', { sub: idA2, email: 'assist.a@exemplo.test' })
    propB = await Sessao.abrir('authenticated', { sub: idB1, email: 'prop.b@exemplo.test' })
    semVinculo = await Sessao.abrir('authenticated', { sub: idC, email: 'sem.vinculo@exemplo.test' })
    anonimo = await Sessao.abrir('anon')

    // Provisionamento: cria operação vazia e vínculo de proprietário.
    ;[{ provisionar_proprietario: opA }] = await propA.consultar<{ provisionar_proprietario: string }>(
      `select public.provisionar_proprietario('Operação A')`,
    )
    ;[{ provisionar_proprietario: opB }] = await propB.consultar<{ provisionar_proprietario: string }>(
      `select public.provisionar_proprietario('Operação B')`,
    )

    // Convite do assistente, aceito pelo destinatário autenticado.
    const [{ criar_convite: token }] = await propA.consultar<{ criar_convite: string }>(
      `select public.criar_convite($1, 'assist.a@exemplo.test')`,
      [opA],
    )
    await assistA.consultar(`select public.aceitar_convite($1)`, [token])

    const [{ hoje_na_operacao }] = await comAdmin(async (c) =>
      (await c.query(`select app.hoje_na_operacao($1)::text as hoje_na_operacao`, [opA])).rows,
    )
    hoje = hoje_na_operacao as string

    const [{ id }] = await propA.consultar<{ id: string }>(
      `insert into public.clientes (operacao_id, nome, telefone, criado_por)
       values ($1, 'Cliente Fictício A', '(75) 9 8000-0001', $2) returning id`,
      [opA, idA1],
    )
    clienteA = id

    // Primeiro vencimento dez dias de cobrança atrás, para haver parcelas
    // vencidas e poder exercitar atraso e recebimento retroativo.
    const [{ inicio }] = await comAdmin(async (c) =>
      (
        await c.query(
          `select (
             select min(d)::text from (
               select generate_series($1::date - 30, $1::date, interval '1 day')::date as d
             ) s where app.dia_permitido(d, $2::text[])
               and (select count(*) from generate_series(d, $1::date, interval '1 day') g
                     where app.dia_permitido(g::date, $2::text[])) = 11
           ) as inicio`,
          [hoje, FERIADOS_PADRAO],
        )
      ).rows,
    )

    const [{ criar_contrato }] = await propA.consultar<{ criar_contrato: string }>(
      `select public.criar_contrato($1, $2, 100000, 40.0, 'diaria', 20, $3::date, null, $4)`,
      [opA, clienteA, inicio, 'contrato-teste-1'],
    )
    contratoA = criar_contrato

    // O contrato nasce com data_contrato = hoje. Para poder testar recebimento
    // retroativo, recuamos a data de início como se ele tivesse sido criado
    // antes do primeiro vencimento.
    await comAdmin(async (c) => {
      await c.query(
        `update public.contratos set data_contrato = $2::date - 1 where id = $1`,
        [contratoA, inicio],
      )
    })

    parcelas = (
      await propA.consultar<{ id: string; numero: number; vencimento: string; valor_cents: string }>(
        `select id, numero, vencimento::text as vencimento, valor_cents
           from public.parcelas where contrato_id = $1 order by numero`,
        [contratoA],
      )
    ).map((p) => ({
      id: p.id,
      numero: p.numero,
      vencimento: p.vencimento,
      valor: cents(p.valor_cents),
    }))
  })

  afterAll(async () => {
    await Promise.all(
      [propA, assistA, propB, semVinculo, anonimo].filter(Boolean).map((s) => s.fechar()),
    )
  })

  // ---------------------------------------------------------------------------
  // 1 e 2 — isolamento entre operações
  // ---------------------------------------------------------------------------

  it('1. uma operação não lê registros de outra', async () => {
    const clientesVistosPorB = await propB.consultar(
      `select id from public.clientes where operacao_id = $1`,
      [opA],
    )
    expect(clientesVistosPorB).toHaveLength(0)

    const contratosVistosPorB = await propB.consultar(
      `select id from public.contratos where operacao_id = $1`,
      [opA],
    )
    expect(contratosVistosPorB).toHaveLength(0)

    // Sem filtro nenhum: a RLS já limita ao vínculo.
    const todosDeB = await propB.consultar(`select id from public.clientes`)
    expect(todosDeB).toHaveLength(0)
  })

  it('1b. uma operação não altera registros de outra', async () => {
    await propB.semEfeito(`update public.clientes set nome = 'invadido' where id = $1`, [clienteA])
    const [{ nome }] = await propA.consultar<{ nome: string }>(
      `select nome from public.clientes where id = $1`,
      [clienteA],
    )
    expect(nome).toBe('Cliente Fictício A')
  })

  it('2. trocar IDs no payload não dá acesso cruzado', async () => {
    // Proprietário B pedindo dados da operação A, direto na RPC.
    expect(await propB.recusa(`select * from public.listar_vencimentos($1, 'hoje')`, [opA]))
      .toMatch(/vínculo ativo/i)
    expect(await propB.recusa(`select * from public.indicadores($1)`, [opA]))
      .toMatch(/vínculo ativo/i)
    expect(
      await propB.recusa(`select public.registrar_pagamento($1, $2, $3::date, 'x')`, [
        opA, parcelas[0].id, hoje,
      ]),
    ).toMatch(/vínculo ativo/i)

    // Proprietário B usando a própria operação, mas apontando para parcela de A.
    expect(
      await propB.recusa(`select public.registrar_pagamento($1, $2, $3::date, 'y')`, [
        opB, parcelas[0].id, hoje,
      ]),
    ).toMatch(/não encontrada/i)

    // Criar contrato em B com cliente de A.
    expect(
      await propB.recusa(
        `select public.criar_contrato($1, $2, 100000, 40.0, 'diaria', 10, $3::date, null, 'z')`,
        [opB, clienteA, hoje],
      ),
    ).toMatch(/não pertence/i)
  })

  it('1c. um cliente não pode ser movido de operação', async () => {
    expect(
      await propA.recusa(`update public.clientes set operacao_id = $2 where id = $1`, [
        clienteA, opB,
      ]),
    ).toMatch(/mover registro entre operações/i)
  })

  // ---------------------------------------------------------------------------
  // 3 e 4 — permissões do assistente
  // ---------------------------------------------------------------------------

  it('3. assistente não acessa campos financeiros restritos', async () => {
    // RLS nega as linhas das tabelas com principal, juros e totais.
    expect(await assistA.consultar(`select id from public.contratos`)).toHaveLength(0)
    expect(await assistA.consultar(`select id from public.parcelas`)).toHaveLength(0)
    expect(await assistA.consultar(`select id from public.pagamentos`)).toHaveLength(0)
    expect(await assistA.consultar(`select id from public.auditoria`)).toHaveLength(0)

    // E os indicadores da carteira são recusados, não apenas escondidos na tela.
    expect(await assistA.recusa(`select * from public.indicadores($1)`, [opA]))
      .toMatch(/restrita ao proprietário/i)
  })

  it('3b. assistente enxerga o necessário para cobrar, e só isso', async () => {
    const lista = await assistA.consultar<Record<string, unknown>>(
      `select * from public.listar_vencimentos($1, 'todos')`,
      [opA],
    )
    expect(lista.length).toBe(20)
    const colunas = Object.keys(lista[0])
    expect(colunas).toContain('total_devido_cents')
    expect(colunas).toContain('acrescimo_cents')
    // Nada de capital, juros, taxa ou totais do contrato.
    for (const proibida of ['principal_cents', 'juros_cents', 'taxa_percent', 'total_cents']) {
      expect(colunas).not.toContain(proibida)
    }
  })

  it('3c. assistente não cria contrato nem edita cliente', async () => {
    expect(
      await assistA.recusa(
        `select public.criar_contrato($1, $2, 50000, 40.0, 'diaria', 10, $3::date, null, 'w')`,
        [opA, clienteA, hoje],
      ),
    ).toMatch(/restrita ao proprietário/i)

    await assistA.semEfeito(`update public.clientes set nome = 'editado' where id = $1`, [clienteA])
    const [{ nome }] = await propA.consultar<{ nome: string }>(
      `select nome from public.clientes where id = $1`,
      [clienteA],
    )
    expect(nome).toBe('Cliente Fictício A')

    // Mas cadastrar cliente ele pode.
    const [{ id }] = await assistA.consultar<{ id: string }>(
      `insert into public.clientes (operacao_id, nome, telefone, criado_por)
       values ($1, 'Cliente do Assistente', '(75) 9 8000-0002', $2) returning id`,
      [opA, idA2],
    )
    expect(id).toBeTruthy()
  })

  it('3d. assistente não forja autoria ao cadastrar cliente', async () => {
    await assistA.recusa(
      `insert into public.clientes (operacao_id, nome, telefone, criado_por)
       values ($1, 'Autoria Forjada', '(75) 9 8000-0003', $2)`,
      [opA, idA1],
    )
  })

  it('4. assistente não promove o próprio papel', async () => {
    await assistA.recusa(
      `update public.membros_operacao set papel = 'proprietario'
        where operacao_id = $1 and usuario_id = $2`,
      [opA, idA2],
    )
    await assistA.recusa(
      `insert into public.membros_operacao (operacao_id, usuario_id, papel)
       values ($1, $2, 'proprietario')`,
      [opB, idA2],
    )
    const [{ papel }] = await propA.consultar<{ papel: string }>(
      `select papel from public.membros_operacao where operacao_id = $1 and usuario_id = $2`,
      [opA, idA2],
    )
    expect(papel).toBe('assistente')
  })

  it('4b. assistente não convida nem revoga membros', async () => {
    expect(await assistA.recusa(`select public.criar_convite($1, 'x@exemplo.test')`, [opA]))
      .toMatch(/restrita ao proprietário/i)
    expect(await assistA.recusa(`select public.revogar_membro($1, $2)`, [opA, idA1]))
      .toMatch(/restrita ao proprietário/i)
  })

  // ---------------------------------------------------------------------------
  // 5 e 6 — sessão anônima, segundo fator e revogação
  // ---------------------------------------------------------------------------

  it('5. sessão anônima não acessa dado nenhum', async () => {
    for (const tabela of ['clientes', 'contratos', 'parcelas', 'pagamentos', 'operacoes']) {
      await anonimo.recusa(`select * from public.${tabela}`)
    }
    await anonimo.recusa(`select * from public.listar_vencimentos($1, 'hoje')`, [opA])
    await anonimo.recusa(`select public.provisionar_proprietario('Invasão')`)
  })

  it('5b. usuário autenticado sem vínculo não acessa a operação', async () => {
    expect(await semVinculo.consultar(`select id from public.clientes`)).toHaveLength(0)
    expect(await semVinculo.recusa(`select * from public.listar_vencimentos($1, 'hoje')`, [opA]))
      .toMatch(/vínculo ativo/i)
  })

  it('6. sessão sem segundo fator (aal1) não acessa dados da operação', async () => {
    const semMfa = await Sessao.abrir('authenticated', {
      sub: idA1,
      email: 'prop.a@exemplo.test',
      aal: 'aal1',
    })
    try {
      // O bloqueio está no banco: mesmo sendo proprietária, em aal1 não passa.
      expect(await semMfa.consultar(`select id from public.clientes`)).toHaveLength(0)
      expect(await semMfa.consultar(`select id from public.operacoes`)).toHaveLength(0)
      expect(await semMfa.recusa(`select * from public.listar_vencimentos($1, 'hoje')`, [opA]))
        .toMatch(/duas etapas/i)
      expect(await semMfa.recusa(`select public.provisionar_proprietario('X')`))
        .toMatch(/duas etapas/i)

      // O próprio perfil continua legível, para a tela de configuração do 2FA.
      expect(await semMfa.consultar(`select id from public.perfis where id = $1`, [idA1]))
        .toHaveLength(1)
    } finally {
      await semMfa.fechar()
    }
  })

  it('6f. relaxar o nível exigido não relaxa isolamento nem papéis', async () => {
    // A verificação em duas etapas do Supabase é recurso de plano pago. Num
    // projeto de homologação gratuito o nível exigido pode ser baixado para
    // aal1 — direto no banco, nunca pela aplicação. Este teste garante que
    // isso libera SÓ o segundo fator: operação, papel e autenticação continuam
    // valendo exatamente igual.
    await comAdmin(async (c) => {
      await c.query(
        `update public.politica_autenticacao
            set nivel_exigido = 'aal1', motivo = 'homologacao no plano gratuito sem MFA'`,
      )
    })

    const semMfa = await Sessao.abrir('authenticated', {
      sub: idA1,
      email: 'prop.a@exemplo.test',
      aal: 'aal1',
    })
    try {
      // Agora a proprietária em aal1 trabalha normalmente.
      expect(await semMfa.consultar(`select id from public.clientes`)).not.toHaveLength(0)
      expect(
        await semMfa.consultar(`select * from public.listar_vencimentos($1, 'todos')`, [opA]),
      ).not.toHaveLength(0)

      // Mas nada mais afrouxou:
      await anonimo.recusa(`select * from public.clientes`)
      await anonimo.recusa(`select * from public.listar_vencimentos($1, 'todos')`, [opA])
      expect(await semVinculo.consultar(`select id from public.clientes`)).toHaveLength(0)
      expect(await propB.consultar(`select id from public.clientes where operacao_id = $1`, [opA]))
        .toHaveLength(0)
      expect(await assistA.consultar(`select id from public.contratos`)).toHaveLength(0)
      expect(await assistA.recusa(`select * from public.indicadores($1)`, [opA]))
        .toMatch(/restrita ao proprietário/i)
    } finally {
      await semMfa.fechar()
      await comAdmin(async (c) => {
        await c.query(
          `update public.politica_autenticacao set nivel_exigido = 'aal2', motivo = null`,
        )
      })
    }
  })

  it('6g. a política de autenticação não é alcançável pela aplicação', async () => {
    // Nem leitura, nem escrita: quem quiser mudar o nível exigido precisa de
    // acesso direto ao banco.
    await propA.recusa(`select * from public.politica_autenticacao`)
    await propA.recusa(`update public.politica_autenticacao set nivel_exigido = 'aal1'`)
    await assistA.recusa(`select * from public.politica_autenticacao`)
    await anonimo.recusa(`select * from public.politica_autenticacao`)
    await propA.recusa(`select app.nivel_exigido()`)
  })

  it('6b. revogação vale já na consulta seguinte, com sessão aberta', async () => {
    const usuarioTmp = await criarUsuario('temporario@exemplo.test', 'Temporário')
    const sessaoTmp = await Sessao.abrir('authenticated', {
      sub: usuarioTmp,
      email: 'temporario@exemplo.test',
    })
    try {
      const [{ criar_convite: token }] = await propA.consultar<{ criar_convite: string }>(
        `select public.criar_convite($1, 'temporario@exemplo.test')`,
        [opA],
      )
      await sessaoTmp.consultar(`select public.aceitar_convite($1)`, [token])
      expect(
        await sessaoTmp.consultar(`select * from public.listar_vencimentos($1, 'todos')`, [opA]),
      ).not.toHaveLength(0)

      await propA.consultar(`select public.revogar_membro($1, $2)`, [opA, usuarioTmp])

      // A mesma sessão, sem novo login, já não passa.
      expect(await sessaoTmp.recusa(`select * from public.listar_vencimentos($1, 'todos')`, [opA]))
        .toMatch(/vínculo ativo/i)
      expect(await sessaoTmp.consultar(`select id from public.clientes`)).toHaveLength(0)
    } finally {
      await sessaoTmp.fechar()
    }
  })

  it('6c. convite só é aceito pelo destinatário', async () => {
    const [{ criar_convite: token }] = await propA.consultar<{ criar_convite: string }>(
      `select public.criar_convite($1, 'outro.destinatario@exemplo.test')`,
      [opA],
    )
    expect(await semVinculo.recusa(`select public.aceitar_convite($1)`, [token]))
      .toMatch(/outro destinatário/i)
    expect(await semVinculo.recusa(`select public.aceitar_convite('token-inventado')`))
      .toMatch(/inválido/i)
  })

  it('6d. convite guarda apenas o hash do token', async () => {
    const [{ criar_convite: token }] = await propA.consultar<{ criar_convite: string }>(
      `select public.criar_convite($1, 'hash@exemplo.test')`,
      [opA],
    )
    const guardados = await comAdmin(async (c) =>
      (await c.query(`select token_hash from public.convites`)).rows,
    )
    expect(guardados.every((l) => l.token_hash !== token)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 7 — atomicidade de contrato e parcelas
  // ---------------------------------------------------------------------------

  it('7. contrato e parcelas são criados atomicamente e fecham com o total', async () => {
    const [contrato] = await propA.consultar<Record<string, string>>(
      `select principal_cents, juros_cents, total_cents, qtd_parcelas
         from public.contratos where id = $1`,
      [contratoA],
    )
    expect(cents(contrato.principal_cents)).toBe(100000)
    expect(cents(contrato.juros_cents)).toBe(40000)
    expect(cents(contrato.total_cents)).toBe(140000)

    const [somas] = await propA.consultar<Record<string, string>>(
      `select count(*)::int as qtd, sum(valor_cents) as valor,
              sum(principal_cents) as principal, sum(juros_cents) as juros
         from public.parcelas where contrato_id = $1`,
      [contratoA],
    )
    expect(Number(somas.qtd)).toBe(20)
    expect(cents(somas.valor)).toBe(140000)
    expect(cents(somas.principal)).toBe(100000)
    expect(cents(somas.juros)).toBe(40000)
    expect(parcelas.every((p) => p.valor === 7000)).toBe(true)
  })

  it('7b. contrato inválido não deixa parcela órfã', async () => {
    const antes = await propA.consultar<{ n: string }>(`select count(*) as n from public.parcelas`)
    await propA.recusa(
      `select public.criar_contrato($1, $2, 100000, 40.0, 'diaria', 0, $3::date, null, 'invalido')`,
      [opA, clienteA, hoje],
    )
    const depois = await propA.consultar<{ n: string }>(`select count(*) as n from public.parcelas`)
    expect(depois[0].n).toBe(antes[0].n)
  })

  it('7c. contrato guarda snapshot das condições', async () => {
    const [snap] = await propA.consultar<Record<string, unknown>>(
      `select snapshot_regra_atraso, snapshot_fuso, array_length(snapshot_feriados, 1) as qtd
         from public.contratos where id = $1`,
      [contratoA],
    )
    expect(snap.snapshot_regra_atraso).toBe('diaria_dobra_unica')
    expect(snap.snapshot_fuso).toBe('America/Bahia')
    expect(Number(snap.qtd)).toBeGreaterThan(0)

    // Mudar a configuração da operação não recalcula contratos existentes.
    await propA.consultar(
      `update public.configuracoes_operacao set feriados_ativos = array['natal'] where operacao_id = $1`,
      [opA],
    )
    const [depois] = await propA.consultar<Record<string, unknown>>(
      `select array_length(snapshot_feriados, 1) as qtd from public.contratos where id = $1`,
      [contratoA],
    )
    expect(Number(depois.qtd)).toBe(Number(snap.qtd))
    await propA.consultar(
      `update public.configuracoes_operacao set feriados_ativos = $2::text[] where operacao_id = $1`,
      [opA, FERIADOS_PADRAO],
    )
  })

  // ---------------------------------------------------------------------------
  // 8, 9, 10, 11 — pagamentos
  // ---------------------------------------------------------------------------

  it('11. a diária atrasada dobra uma vez e não volta a crescer', async () => {
    // A parcela 1 está vencida há vários dias de cobrança.
    const [linha] = await propA.consultar<Record<string, string>>(
      `select valor_original_cents, acrescimo_cents, total_devido_cents, situacao, dias_de_atraso
         from public.listar_vencimentos($1, 'atrasados') where parcela_id = $2`,
      [opA, parcelas[0].id],
    )
    expect(linha.situacao).toBe('atrasada')
    expect(cents(linha.valor_original_cents)).toBe(7000)
    expect(cents(linha.acrescimo_cents)).toBe(7000)
    expect(cents(linha.total_devido_cents)).toBe(14000)
    expect(Number(linha.dias_de_atraso)).toBeGreaterThan(1)
  })

  it('10. pagamento retroativo usa a data real, sem acréscimo pela digitação', async () => {
    const parcela = parcelas[0]
    const [{ registrar_pagamento: pago }] = await propA.consultar<{ registrar_pagamento: string }>(
      `select public.registrar_pagamento($1, $2, $3::date, $4)`,
      [opA, parcela.id, parcela.vencimento, 'retroativo-1'],
    )

    const [pagamento] = await propA.consultar<Record<string, string>>(
      `select data_pagamento::text as data_pagamento, valor_original_cents, acrescimo_cents,
              valor_total_cents,
              (registrado_em at time zone 'America/Bahia')::date::text as registrado_data,
              registrado_por
         from public.pagamentos where id = $1`,
      [pago],
    )
    // Recebida no vencimento, digitada dias depois: sem acréscimo.
    expect(pagamento.data_pagamento).toBe(parcela.vencimento)
    expect(cents(pagamento.acrescimo_cents)).toBe(0)
    expect(cents(pagamento.valor_total_cents)).toBe(7000)
    // A auditoria usa o horário real do servidor, não a data informada.
    expect(pagamento.registrado_data).toBe(hoje)
    expect(pagamento.registrado_por).toBe(idA1)
  })

  it('10b. pagamento futuro e anterior ao contrato são recusados', async () => {
    expect(
      await propA.recusa(`select public.registrar_pagamento($1, $2, ($3::date + 1), 'futuro')`, [
        opA, parcelas[1].id, hoje,
      ]),
    ).toMatch(/data futura/i)

    expect(
      await propA.recusa(
        `select public.registrar_pagamento($1, $2, ($3::date - 400), 'antigo')`,
        [opA, parcelas[1].id, hoje],
      ),
    ).toMatch(/anterior ao início/i)
  })

  it('9. reenvio com a mesma chave de idempotência não duplica lançamento', async () => {
    const parcela = parcelas[1]
    const chave = 'idempotente-1'
    const [{ registrar_pagamento: p1 }] = await propA.consultar<{ registrar_pagamento: string }>(
      `select public.registrar_pagamento($1, $2, $3::date, $4)`,
      [opA, parcela.id, parcela.vencimento, chave],
    )
    const [{ registrar_pagamento: p2 }] = await propA.consultar<{ registrar_pagamento: string }>(
      `select public.registrar_pagamento($1, $2, $3::date, $4)`,
      [opA, parcela.id, parcela.vencimento, chave],
    )
    expect(p2).toBe(p1)

    const [{ n }] = await propA.consultar<{ n: string }>(
      `select count(*) as n from public.alocacoes_pagamento where parcela_id = $1`,
      [parcela.id],
    )
    expect(Number(n)).toBe(1)
  })

  it('6e. a mesma parcela não é paga duas vezes, nem com chave diferente', async () => {
    expect(
      await propA.recusa(`select public.registrar_pagamento($1, $2, $3::date, 'outra-chave')`, [
        opA, parcelas[1].id, hoje,
      ]),
    ).toMatch(/já consta como paga/i)
  })

  it('8. duas sessões simultâneas geram um único recebimento válido', async () => {
    const parcela = parcelas[2]
    const a = new Client({ connectionString: URL_BANCO })
    const b = new Client({ connectionString: URL_BANCO })
    await a.connect()
    await b.connect()

    const preparar = async (c: Client, sub: string, email: string) => {
      await c.query('begin')
      await c.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub, email, aal: 'aal2' }),
      ])
      await c.query('set local role authenticated')
    }

    try {
      await preparar(a, idA1, 'prop.a@exemplo.test')
      await preparar(b, idA2, 'assist.a@exemplo.test')

      // A primeira transação trava a parcela e ainda não confirma.
      await a.query(`select public.registrar_pagamento($1, $2, $3::date, 'corrida-a')`, [
        opA, parcela.id, hoje,
      ])

      // A segunda fica bloqueada no FOR UPDATE; só resolve após o commit de A.
      const corridaB = b
        .query(`select public.registrar_pagamento($1, $2, $3::date, 'corrida-b')`, [
          opA, parcela.id, hoje,
        ])
        .then(() => 'aceito' as const)
        .catch((e: Error) => e.message)

      await a.query('commit')
      const resultadoB = await corridaB
      await b.query('rollback').catch(() => undefined)

      expect(resultadoB).not.toBe('aceito')
      expect(String(resultadoB)).toMatch(/já consta como paga/i)

      const { rows } = await a.query(
        `select count(*)::int as n from public.alocacoes_pagamento
          where parcela_id = $1 and not revogada`,
        [parcela.id],
      )
      expect(rows[0].n).toBe(1)
    } finally {
      await a.end().catch(() => undefined)
      await b.end().catch(() => undefined)
    }
  })

  it('8b. assistente registra pagamento integral', async () => {
    const parcela = parcelas[3]
    const [{ registrar_pagamento: pago }] = await assistA.consultar<{ registrar_pagamento: string }>(
      `select public.registrar_pagamento($1, $2, $3::date, 'assistente-1')`,
      [opA, parcela.id, hoje],
    )
    const [{ registrado_por }] = await propA.consultar<{ registrado_por: string }>(
      `select registrado_por from public.pagamentos where id = $1`,
      [pago],
    )
    expect(registrado_por).toBe(idA2)
  })

  // ---------------------------------------------------------------------------
  // 12 — quitação e reversão
  // ---------------------------------------------------------------------------

  it('12. reversão preserva o original, devolve o saldo e registra auditoria', async () => {
    const parcela = parcelas[4]
    const [{ registrar_pagamento: pago }] = await propA.consultar<{ registrar_pagamento: string }>(
      `select public.registrar_pagamento($1, $2, $3::date, 'para-reverter')`,
      [opA, parcela.id, hoje],
    )

    await propA.consultar(`select public.reverter_pagamento($1, $2, 'lançado no contrato errado')`, [
      opA, pago,
    ])

    // O lançamento original continua lá, agora marcado.
    const [original] = await propA.consultar<Record<string, unknown>>(
      `select estornado_em is not null as estornado, estornado_por, valor_total_cents
         from public.pagamentos where id = $1`,
      [pago],
    )
    expect(original.estornado).toBe(true)
    expect(original.estornado_por).toBe(idA1)

    const [estorno] = await propA.consultar<Record<string, unknown>>(
      `select motivo, criado_por from public.estornos_pagamento where pagamento_id = $1`,
      [pago],
    )
    expect(estorno.motivo).toBe('lançado no contrato errado')
    expect(estorno.criado_por).toBe(idA1)

    // A parcela volta a ficar em aberto e aceita um novo pagamento válido.
    const [linha] = await propA.consultar<Record<string, string>>(
      `select situacao from public.listar_vencimentos($1, 'todos') where parcela_id = $2`,
      [opA, parcela.id],
    )
    expect(linha.situacao).not.toBe('paga')

    const [{ registrar_pagamento: novo }] = await propA.consultar<{ registrar_pagamento: string }>(
      `select public.registrar_pagamento($1, $2, $3::date, 'apos-reversao')`,
      [opA, parcela.id, hoje],
    )
    expect(novo).toBeTruthy()

    // Reversão duplicada não passa.
    expect(await propA.recusa(`select public.reverter_pagamento($1, $2, 'de novo')`, [opA, pago]))
      .toMatch(/já foi desfeito/i)

    const auditoria = await propA.consultar(
      `select id from public.auditoria where tipo = 'pagamento_estornado' and entidade_id = $1`,
      [pago],
    )
    expect(auditoria).toHaveLength(1)
  })

  it('12b. assistente não reverte pagamento', async () => {
    const [{ id }] = await propA.consultar<{ id: string }>(
      `select id from public.pagamentos where operacao_id = $1 and estornado_em is null limit 1`,
      [opA],
    )
    expect(await assistA.recusa(`select public.reverter_pagamento($1, $2, 'tentativa')`, [opA, id]))
      .toMatch(/restrita ao proprietário/i)
  })

  it('12c. quitação cobra o saldo com acréscimo só do que já venceu', async () => {
    const [{ id: cliente2 }] = await propA.consultar<{ id: string }>(
      `insert into public.clientes (operacao_id, nome, telefone, criado_por)
       values ($1, 'Cliente Quitação', '(75) 9 8000-0009', $2) returning id`,
      [opA, idA1],
    )
    const [{ criar_contrato: contrato2 }] = await propA.consultar<{ criar_contrato: string }>(
      `select public.criar_contrato($1, $2, 70000, 40.0, 'diaria', 14, ($3::date - 3), null, 'quitacao-1')`,
      [opA, cliente2, hoje],
    )
    await comAdmin(async (c) => {
      await c.query(`update public.contratos set data_contrato = $2::date - 10 where id = $1`, [
        contrato2, hoje,
      ])
    })

    const emAberto = await propA.consultar<Record<string, string>>(
      `select parcela_id, vencimento::text as vencimento, valor_original_cents,
              acrescimo_cents, total_devido_cents
         from public.listar_vencimentos($1, 'todos') where contrato_id = $2`,
      [opA, contrato2],
    )
    const vencidas = emAberto.filter((p) => p.vencimento < hoje)
    const aVencer = emAberto.filter((p) => p.vencimento > hoje)
    expect(vencidas.length).toBeGreaterThan(0)
    expect(aVencer.length).toBeGreaterThan(0)
    // Parcelas ainda não vencidas não recebem acréscimo antecipado.
    expect(aVencer.every((p) => cents(p.acrescimo_cents) === 0)).toBe(true)

    const esperado = emAberto.reduce((s, p) => s + cents(p.total_devido_cents), 0)

    const [{ quitar_contrato: quitacao }] = await propA.consultar<{ quitar_contrato: string }>(
      `select public.quitar_contrato($1, $2, $3::date, 'quitacao-pag-1')`,
      [opA, contrato2, hoje],
    )
    const [pagamento] = await propA.consultar<Record<string, string>>(
      `select valor_total_cents, tipo from public.pagamentos where id = $1`,
      [quitacao],
    )
    expect(pagamento.tipo).toBe('quitacao')
    expect(cents(pagamento.valor_total_cents)).toBe(esperado)

    // A composição por parcela é preservada, não apenas o total.
    const [{ n, soma }] = await propA.consultar<{ n: string; soma: string }>(
      `select count(*) as n, sum(valor_original_cents + acrescimo_cents) as soma
         from public.alocacoes_pagamento where pagamento_id = $1`,
      [quitacao],
    )
    expect(Number(n)).toBe(emAberto.length)
    expect(cents(soma)).toBe(esperado)

    // Contrato quitado: nada mais em aberto.
    const restantes = await propA.consultar(
      `select parcela_id from public.listar_vencimentos($1, 'todos')
        where contrato_id = $2 and situacao <> 'paga'`,
      [opA, contrato2],
    )
    expect(restantes).toHaveLength(0)

    expect(await propA.recusa(`select public.quitar_contrato($1, $2, $3::date, 'quitacao-2')`, [
      opA, contrato2, hoje,
    ])).toMatch(/já está quitado/i)
  })

  // ---------------------------------------------------------------------------
  // 13 — reconciliação
  // ---------------------------------------------------------------------------

  it('13. indicadores reconciliam com contratos, parcelas e pagamentos', async () => {
    const [ind] = await propA.consultar<Record<string, string>>(
      `select * from public.indicadores($1)`,
      [opA],
    )

    const [conferencia] = await propA.consultar<Record<string, string>>(
      `with aberto as (
         select pa.valor_cents, pa.principal_cents, pa.juros_cents, pa.vencimento,
                app.acrescimo_atraso(pa.valor_cents, pa.vencimento, c.snapshot_regra_atraso,
                  app.hoje_na_operacao($1)) as acrescimo
           from public.parcelas pa
           join public.contratos c on c.id = pa.contrato_id
          where pa.operacao_id = $1
            and not exists (select 1 from public.alocacoes_pagamento a
                             where a.parcela_id = pa.id and not a.revogada)
       )
       select coalesce(sum(principal_cents), 0) as principal,
              coalesce(sum(juros_cents), 0) as juros,
              coalesce(sum(acrescimo), 0) as acrescimo,
              coalesce(sum(valor_cents + acrescimo), 0) as receber
         from aberto`,
      [opA],
    )

    expect(cents(ind.principal_em_aberto_cents)).toBe(cents(conferencia.principal))
    expect(cents(ind.juros_em_aberto_cents)).toBe(cents(conferencia.juros))
    expect(cents(ind.acrescimos_em_aberto_cents)).toBe(cents(conferencia.acrescimo))
    expect(cents(ind.total_a_receber_cents)).toBe(cents(conferencia.receber))
    // Total a receber = principal + juros + acréscimos, sem sobra nem falta.
    expect(cents(ind.total_a_receber_cents)).toBe(
      cents(conferencia.principal) + cents(conferencia.juros) + cents(conferencia.acrescimo),
    )

    // Recebido hoje usa a data real do pagamento, não a da digitação.
    const [{ soma }] = await propA.consultar<{ soma: string }>(
      `select coalesce(sum(valor_total_cents), 0) as soma from public.pagamentos
        where operacao_id = $1 and estornado_em is null and data_pagamento = $2::date`,
      [opA, hoje],
    )
    expect(cents(ind.recebido_hoje_cents)).toBe(cents(soma))
    // O pagamento retroativo do primeiro teste NÃO entra no recebido de hoje.
    const [{ n }] = await propA.consultar<{ n: string }>(
      `select count(*) as n from public.pagamentos
        where operacao_id = $1 and estornado_em is null and data_pagamento < $2::date`,
      [opA, hoje],
    )
    expect(Number(n)).toBeGreaterThan(0)
  })

  it('13b. extrato do contrato fecha com as parcelas', async () => {
    const linhas = await propA.consultar<Record<string, string>>(
      `select situacao, valor_original_cents, acrescimo_cents, total_devido_cents
         from public.listar_vencimentos($1, 'todos') where contrato_id = $2`,
      [opA, contratoA],
    )
    expect(linhas).toHaveLength(20)
    const somaOriginais = linhas.reduce((s, l) => s + cents(l.valor_original_cents), 0)
    expect(somaOriginais).toBe(140000)

    const [{ pago }] = await propA.consultar<{ pago: string }>(
      `select coalesce(sum(valor_total_cents), 0) as pago from public.pagamentos
        where contrato_id = $1 and estornado_em is null`,
      [contratoA],
    )
    const somaPagas = linhas
      .filter((l) => l.situacao === 'paga')
      .reduce((s, l) => s + cents(l.total_devido_cents), 0)
    expect(somaPagas).toBe(cents(pago))
  })

  // ---------------------------------------------------------------------------
  // Histórico financeiro é imutável
  // ---------------------------------------------------------------------------

  it('histórico financeiro não pode ser apagado nem adulterado', async () => {
    await propA.recusa(`delete from public.pagamentos where operacao_id = $1`, [opA])
    await propA.recusa(`delete from public.contratos where operacao_id = $1`, [opA])
    await propA.recusa(`update public.pagamentos set valor_total_cents = 1 where operacao_id = $1`, [opA])
    await propA.recusa(`insert into public.auditoria (operacao_id, tipo, entidade) values ($1, 'x', 'y')`, [opA])
    await propA.recusa(`update public.parcelas set valor_cents = 1 where operacao_id = $1`, [opA])
    // Nem a própria autoria dos lançamentos pode ser reescrita.
    await propA.recusa(`update public.pagamentos set registrado_por = $2 where operacao_id = $1`, [opA, idA2])

    // Nem com privilégio de proprietário o DELETE direto passa: há gatilho.
    const erro = await comAdmin(async (c) => {
      try {
        await c.query(`delete from public.pagamentos where operacao_id = $1`, [opA])
        return 'aceito'
      } catch (e) {
        return (e as Error).message
      }
    })
    expect(erro).toMatch(/não pode ser excluído/i)
  })

  it('funções internas de apoio não são chamáveis pelo usuário', async () => {
    // `registrar_auditoria` roda como dono e passa por cima da RLS: exposta,
    // permitiria forjar linhas de auditoria.
    expect(
      await propA.recusa(
        `select app.registrar_auditoria($1, 'forjado', 'pagamentos', null, '{}'::jsonb)`,
        [opA],
      ),
    ).toMatch(/permission denied|permissão negada/i)
    expect(await propA.recusa(`select app.exigir_proprietario($1)`, [opA]))
      .toMatch(/permission denied|permissão negada/i)
    expect(await assistA.recusa(`select app.exigir_membro($1)`, [opA]))
      .toMatch(/permission denied|permissão negada/i)
  })

  it('provisionamento é idempotente e não cria segunda operação', async () => {
    const [{ provisionar_proprietario: repetido }] = await propA.consultar<{
      provisionar_proprietario: string
    }>(`select public.provisionar_proprietario('Outro nome')`)
    expect(repetido).toBe(opA)

    const [{ n }] = await propA.consultar<{ n: string }>(
      `select count(*) as n from public.operacoes`,
    )
    expect(Number(n)).toBe(1)
  })
})

if (!temBanco) {
  // Mensagem única, para o CI não passar em silêncio achando que rodou tudo.
  console.warn(
    `[banco] testes de integração pulados: sem PostgreSQL em ${URL_BANCO}. ` +
      'Rode ./scripts/db-local.sh para executá-los.',
  )
}
