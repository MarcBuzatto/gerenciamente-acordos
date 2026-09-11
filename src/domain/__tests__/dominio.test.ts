import { describe, expect, it } from 'vitest'
import {
  compararDatas,
  diaDaSemana,
  diferencaDias,
  formatarData,
  somarDias,
  somarMeses,
  paraDiaSerial,
  deDiaSerial,
} from '../dates'
import { calcularJuros, repartir, somar, analisarMoeda, formatarMoeda } from '../dinheiro'
import {
  avaliarPrimeiroVencimento,
  ehDiaPermitido,
  gerarVencimentos,
  proximoDiaPermitido,
} from '../calendario'
import { domingoDePascoa, feriadoEm, IDS_FERIADO_PADRAO } from '../feriados'
import { fechaComTotal, gerarParcelas, montarResumoContrato } from '../contratos'
import {
  acrescimoPorAtraso,
  avaliarParcela,
  montarQuitacao,
  pagamentoDaParcela,
  situacaoContrato,
} from '../cobranca'
import {
  calcularIndicadoresCarteira,
  calcularIndicadoresDia,
  resumirContrato,
} from '../indicadores'
import { criarEstadoSeed, DATA_DEMO_INICIAL } from '../../data/seed'
import type { Contrato, EstadoOperacao, Pagamento } from '../tipos'

const FERIADOS = IDS_FERIADO_PADRAO

function contratoBase(over: Partial<Contrato> = {}): Contrato {
  const principalCents = 100_000
  const taxaPercent = 40
  const jurosCents = calcularJuros(principalCents, taxaPercent)
  return {
    id: 'c1',
    operacaoId: 'op-teste',
    clienteId: 'cli1',
    numero: 1,
    principalCents,
    taxaPercent,
    jurosCents,
    totalCents: principalCents + jurosCents,
    frequencia: 'diaria',
    qtdParcelas: 20,
    primeiroVencimento: '2026-09-14', // segunda-feira
    dataContrato: '2026-09-13',
    criadoEm: '2026-09-13T10:00:00.000-03:00',
    criadoPor: 'u1',
    ...over,
  }
}

describe('datas civis', () => {
  it('converte ida e volta sem deslocamento de fuso', () => {
    for (const d of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-12-31', '2027-03-01']) {
      expect(deDiaSerial(paraDiaSerial(d))).toBe(d)
    }
  })

  it('identifica o dia da semana', () => {
    expect(diaDaSemana('2026-09-11')).toBe(5) // sexta
    expect(diaDaSemana('2026-09-13')).toBe(0) // domingo
    expect(diaDaSemana('2026-09-12')).toBe(6) // sábado
  })

  it('soma dias e meses com ancoragem no último dia do mês', () => {
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01')
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2024-01-31', 1)).toBe('2024-02-29')
    expect(diferencaDias('2026-09-01', '2026-09-11')).toBe(10)
    expect(compararDatas('2026-09-01', '2026-09-11')).toBe(-1)
  })

  it('formata em DD/MM/AAAA', () => {
    expect(formatarData('2026-09-07')).toBe('07/09/2026')
  })
})

describe('dinheiro', () => {
  it('reparte preservando o total', () => {
    expect(somar(repartir(140_000, 20))).toBe(140_000)
    expect(repartir(140_000, 20).every((v) => v === 7_000)).toBe(true)
    for (const [total, n] of [
      [100_00, 3],
      [1_000_01, 7],
      [999_99, 13],
      [1, 5],
    ] as const) {
      const partes = repartir(total, n)
      expect(partes).toHaveLength(n)
      expect(somar(partes)).toBe(total)
      expect(Math.max(...partes) - Math.min(...partes)).toBeLessThanOrEqual(1)
    }
  })

  it('lê valores digitados em português', () => {
    expect(analisarMoeda('1.000,50')).toBe(100_050)
    expect(analisarMoeda('1000,5')).toBe(100_050)
    expect(analisarMoeda('1000')).toBe(100_000)
    expect(analisarMoeda('R$ 70,00')).toBe(7_000)
    expect(analisarMoeda('')).toBeNull()
  })

  it('formata em reais', () => {
    expect(formatarMoeda(140_000).replace(/ /g, ' ')).toBe('R$ 1.400,00')
  })
})

describe('verificação 1 e 2 — R$ 1.000 com 40% em 20 parcelas', () => {
  const resumo = montarResumoContrato({
    principalCents: 100_000,
    taxaPercent: 40,
    frequencia: 'diaria',
    qtdParcelas: 20,
    primeiroVencimento: '2026-09-14',
    feriadosAtivos: FERIADOS,
  })

  it('gera juros de R$ 400 e total de R$ 1.400', () => {
    expect(resumo.jurosCents).toBe(40_000)
    expect(resumo.totalCents).toBe(140_000)
  })

  it('gera 20 parcelas de R$ 70', () => {
    expect(resumo.valoresParcelas).toHaveLength(20)
    expect(resumo.valoresParcelas.every((v) => v === 7_000)).toBe(true)
    expect(resumo.parcelasDesiguais).toBe(false)
  })

  it('mantém a soma das parcelas igual ao total mesmo com resto', () => {
    expect(fechaComTotal(resumo)).toBe(true)
    const quebrado = montarResumoContrato({
      principalCents: 100_000,
      taxaPercent: 37,
      frequencia: 'diaria',
      qtdParcelas: 21,
      primeiroVencimento: '2026-09-14',
      feriadosAtivos: FERIADOS,
    })
    expect(fechaComTotal(quebrado)).toBe(true)
    expect(somar(quebrado.valoresParcelas)).toBe(137_000)
  })

  it('mantém a composição principal/juros somando com o contrato', () => {
    const contrato = contratoBase({ taxaPercent: 37, jurosCents: 37_000, totalCents: 137_000, qtdParcelas: 21 })
    const parcelas = gerarParcelas(contrato, FERIADOS, (i) => `p${i}`)
    expect(somar(parcelas.map((p) => p.principalCents))).toBe(contrato.principalCents)
    expect(somar(parcelas.map((p) => p.jurosCents))).toBe(contrato.jurosCents)
    expect(somar(parcelas.map((p) => p.valorCents))).toBe(contrato.totalCents)
    expect(parcelas.every((p) => p.principalCents + p.jurosCents === p.valorCents)).toBe(true)
  })
})

describe('verificação 3 — calendário das diárias', () => {
  it('calcula a Páscoa e os feriados móveis', () => {
    expect(domingoDePascoa(2026)).toBe('2026-04-05')
    expect(domingoDePascoa(2027)).toBe('2027-03-28')
    expect(feriadoEm('2026-04-03', FERIADOS)?.regra.id).toBe('sexta-santa')
  })

  it('pula domingo e feriado, mantendo sábado', () => {
    const v = gerarVencimentos('diaria', '2026-08-31', 12, FERIADOS).map((x) => x.data)
    expect(v).toEqual([
      '2026-08-31', // segunda
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05', // sábado conta
      // 06/09 domingo e 07/09 Independência são pulados
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12', // sábado conta
      '2026-09-14',
    ])
  })

  it('gera exatamente a quantidade contratada', () => {
    for (const n of [1, 7, 20, 60, 180]) {
      expect(gerarVencimentos('diaria', '2026-09-14', n, FERIADOS)).toHaveLength(n)
    }
  })

  it('nunca gera vencimento em dia excluído', () => {
    const v = gerarVencimentos('diaria', '2026-01-01', 200, FERIADOS)
    expect(v.every((x) => ehDiaPermitido(x.data, FERIADOS))).toBe(true)
  })

  it('explica o ajuste quando o primeiro vencimento é inválido', () => {
    const domingo = avaliarPrimeiroVencimento('2026-09-13', FERIADOS)
    expect(domingo.motivo?.tipo).toBe('domingo')
    expect(domingo.ajustado).toBe('2026-09-14')
    expect(domingo.explicacao).toContain('14/09/2026')

    const feriado = avaliarPrimeiroVencimento('2026-09-07', FERIADOS)
    expect(feriado.motivo?.tipo).toBe('feriado')
    expect(feriado.ajustado).toBe('2026-09-08')

    const valido = avaliarPrimeiroVencimento('2026-09-14', FERIADOS)
    expect(valido.explicacao).toBeNull()
    expect(valido.ajustado).toBe('2026-09-14')
  })

  it('semanal mantém a data-base sem acumular ajustes', () => {
    // 06/09/2026 é domingo: a 1ª parcela vai para 08/09 (07/09 é feriado),
    // mas a 2ª volta para a base 13/09 -> como é domingo, cai em 14/09.
    const v = gerarVencimentos('semanal', '2026-09-06', 4, FERIADOS)
    expect(v.map((x) => x.dataBase)).toEqual([
      '2026-09-06',
      '2026-09-13',
      '2026-09-20',
      '2026-09-27',
    ])
    expect(v.map((x) => x.data)).toEqual([
      '2026-09-08',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ])
  })

  it('mensal usa o mesmo dia e recua para o último dia quando não existe', () => {
    const v = gerarVencimentos('mensal', '2026-01-31', 4, FERIADOS)
    expect(v.map((x) => x.dataBase)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
    expect(v.every((x) => ehDiaPermitido(x.data, FERIADOS))).toBe(true)
  })

  it('proximoDiaPermitido não altera um dia válido', () => {
    expect(proximoDiaPermitido('2026-09-12', FERIADOS)).toBe('2026-09-12')
  })
})

describe('verificação 4 — atraso da diária dobra uma única vez', () => {
  const contrato = contratoBase()
  const parcelas = gerarParcelas(contrato, FERIADOS, (i) => `p${i}`)
  const primeira = parcelas[0] // 14/09/2026

  it('não acrescenta no dia do vencimento', () => {
    expect(acrescimoPorAtraso(primeira, contrato, '2026-09-14')).toBe(0)
    expect(primeira.valorCents).toBe(7_000)
  })

  it('dobra no dia seguinte e congela', () => {
    expect(primeira.valorCents + acrescimoPorAtraso(primeira, contrato, '2026-09-15')).toBe(14_000)
    expect(primeira.valorCents + acrescimoPorAtraso(primeira, contrato, '2026-09-25')).toBe(14_000)
    expect(primeira.valorCents + acrescimoPorAtraso(primeira, contrato, '2027-09-25')).toBe(14_000)
  })

  it('acrescenta mesmo quando o dia seguinte é domingo', () => {
    const sabado = parcelas.find((p) => p.vencimento === '2026-09-19')!
    expect(diaDaSemana('2026-09-20')).toBe(0)
    expect(acrescimoPorAtraso(sabado, contrato, '2026-09-20')).toBe(sabado.valorCents)
  })

  it('não acrescenta em semanal nem mensal', () => {
    const semanal = contratoBase({ frequencia: 'semanal', qtdParcelas: 4 })
    const p = gerarParcelas(semanal, FERIADOS, (i) => `s${i}`)[0]
    expect(acrescimoPorAtraso(p, semanal, somarDias(p.vencimento, 30))).toBe(0)

    const mensal = contratoBase({ frequencia: 'mensal', qtdParcelas: 4 })
    const pm = gerarParcelas(mensal, FERIADOS, (i) => `m${i}`)[0]
    expect(acrescimoPorAtraso(pm, mensal, somarDias(pm.vencimento, 90))).toBe(0)
  })
})

function estadoDeTeste(): EstadoOperacao {
  const contrato = contratoBase()
  const parcelas = gerarParcelas(contrato, FERIADOS, (i) => `p${i}`)
  return {
    clientes: [
      {
        id: 'cli1',
        operacaoId: 'op-teste',
        nome: 'Cliente Fictício',
        telefone: '(75) 9 0000-0000',
        criadoEm: '2026-09-13T09:00:00.000-03:00',
      },
    ],
    contratos: [contrato],
    parcelas,
    pagamentos: [],
    eventos: [],
    config: { feriadosAtivos: FERIADOS },
    proximoNumeroContrato: 2,
  }
}

function pagar(
  estado: EstadoOperacao,
  parcelaIndice: number,
  dataPagamento: string,
  registradoEm: string,
): Pagamento {
  const contrato = estado.contratos[0]
  const parcela = estado.parcelas[parcelaIndice]
  const acrescimo = acrescimoPorAtraso(parcela, contrato, dataPagamento)
  const pagamento: Pagamento = {
    id: `pag${parcelaIndice}`,
    operacaoId: 'op-teste',
    contratoId: contrato.id,
    parcelaIds: [parcela.id],
    itens: [
      { parcelaId: parcela.id, valorOriginalCents: parcela.valorCents, acrescimoCents: acrescimo },
    ],
    dataPagamento,
    registradoEm,
    registradoPor: 'u1',
    valorOriginalCents: parcela.valorCents,
    acrescimoCents: acrescimo,
    valorTotalCents: parcela.valorCents + acrescimo,
    meio: 'pix',
    tipo: 'parcela',
  }
  estado.pagamentos.push(pagamento)
  return pagamento
}

describe('verificação 5 — pagamento retroativo', () => {
  it('usa a data real no cálculo e no painel', () => {
    const estado = estadoDeTeste()
    // Parcela 1 vence 14/09, foi recebida no vencimento e digitada em 16/09.
    const pagamento = pagar(estado, 0, '2026-09-14', '2026-09-16T20:40:00.000-03:00')
    expect(pagamento.acrescimoCents).toBe(0)
    expect(pagamento.valorTotalCents).toBe(7_000)

    const em14 = calcularIndicadoresDia(estado, '2026-09-14')
    expect(em14.recebidoHojeCents).toBe(7_000)

    const em16 = calcularIndicadoresDia(estado, '2026-09-16')
    expect(em16.recebidoHojeCents).toBe(0)
  })

  it('cobra o acréscimo quando a data real já está em atraso', () => {
    const estado = estadoDeTeste()
    const pagamento = pagar(estado, 0, '2026-09-16', '2026-09-16T08:00:00.000-03:00')
    expect(pagamento.acrescimoCents).toBe(7_000)
    expect(pagamento.valorTotalCents).toBe(14_000)
    expect(calcularIndicadoresDia(estado, '2026-09-16').recebidoHojeCents).toBe(14_000)
  })
})

describe('verificação 6 — a mesma parcela não é paga duas vezes', () => {
  it('marca a parcela como quitada e impede novo vínculo ativo', () => {
    const estado = estadoDeTeste()
    pagar(estado, 0, '2026-09-14', '2026-09-14T10:00:00.000-03:00')
    const parcela = estado.parcelas[0]
    expect(pagamentoDaParcela(parcela.id, estado.pagamentos)).not.toBeNull()

    const aberta = montarQuitacao(
      estado.parcelas,
      estado.contratos[0],
      estado.clientes[0],
      estado.pagamentos,
      '2026-09-14',
    )
    expect(aberta.parcelas.some((p) => p.parcela.id === parcela.id)).toBe(false)
    expect(aberta.parcelas).toHaveLength(19)
  })
})

describe('verificação 7 — novo contrato preserva o anterior', () => {
  it('mantém parcelas e saldo do contrato existente', () => {
    const estado = estadoDeTeste()
    pagar(estado, 0, '2026-09-14', '2026-09-14T10:00:00.000-03:00')
    const antes = resumirContrato(estado, estado.contratos[0], '2026-09-14')!

    const novo = contratoBase({
      id: 'c2',
      numero: 2,
      principalCents: 50_000,
      jurosCents: 20_000,
      totalCents: 70_000,
      qtdParcelas: 10,
      primeiroVencimento: '2026-09-21',
    })
    estado.contratos.push(novo)
    estado.parcelas.push(...gerarParcelas(novo, FERIADOS, (i) => `c2p${i}`))

    const depois = resumirContrato(estado, estado.contratos[0], '2026-09-14')!
    expect(depois.saldoCents).toBe(antes.saldoCents)
    expect(depois.parcelas).toHaveLength(20)
    expect(resumirContrato(estado, novo, '2026-09-14')!.saldoCents).toBe(70_000)
  })
})

describe('verificação 8 — operações não misturam dados', () => {
  it('mantém identificadores e conjuntos separados', () => {
    const a = criarEstadoSeed('op-a', DATA_DEMO_INICIAL)
    const b = criarEstadoSeed('op-b', DATA_DEMO_INICIAL)

    expect(a.clientes.every((c) => c.operacaoId === 'op-a')).toBe(true)
    expect(b.clientes.every((c) => c.operacaoId === 'op-b')).toBe(true)
    expect(a.contratos.every((c) => c.operacaoId === 'op-a')).toBe(true)
    expect(b.contratos.every((c) => c.operacaoId === 'op-b')).toBe(true)

    const idsA = new Set(a.clientes.map((c) => c.id))
    expect(b.clientes.some((c) => idsA.has(c.id))).toBe(false)
    const nomesA = new Set(a.clientes.map((c) => c.nome))
    expect(b.clientes.some((c) => nomesA.has(c.nome))).toBe(false)
  })
})

describe('verificação 10 — reversão preserva histórico', () => {
  it('mantém o lançamento original e devolve o saldo', () => {
    const estado = estadoDeTeste()
    const pagamento = pagar(estado, 0, '2026-09-14', '2026-09-14T10:00:00.000-03:00')
    const comPagamento = resumirContrato(estado, estado.contratos[0], '2026-09-14')!
    expect(comPagamento.totalPagoCents).toBe(7_000)
    expect(comPagamento.qtdPagas).toBe(1)

    pagamento.estorno = { em: '2026-09-14T11:00:00.000-03:00', por: 'u1', motivo: 'contrato errado' }

    const revertido = resumirContrato(estado, estado.contratos[0], '2026-09-14')!
    expect(revertido.totalPagoCents).toBe(0)
    expect(revertido.qtdPagas).toBe(0)
    expect(revertido.saldoCents).toBe(comPagamento.saldoCents + 7_000)
    // O registro original continua no histórico, agora marcado como desfeito.
    expect(revertido.pagamentos).toHaveLength(1)
    expect(revertido.pagamentos[0].estorno?.motivo).toBe('contrato errado')
  })
})

describe('verificação 11 — o extrato fecha com as parcelas', () => {
  it('soma parcelas, pagamentos e saldo de forma consistente', () => {
    const estado = criarEstadoSeed('op-a', DATA_DEMO_INICIAL)
    for (const contrato of estado.contratos) {
      const r = resumirContrato(estado, contrato, DATA_DEMO_INICIAL)!
      const somaParcelas = somar(r.parcelas.map((p) => p.valorCents))
      expect(somaParcelas).toBe(contrato.totalCents)

      const pagas = r.avaliadas.filter((a) => a.situacao === 'paga')
      const somaPagas = somar(pagas.map((a) => a.valorOriginalCents + a.acrescimoCents))
      expect(somaPagas).toBe(r.totalPagoCents)

      const abertas = r.avaliadas.filter((a) => a.situacao !== 'paga')
      expect(somar(abertas.map((a) => a.totalDevidoCents))).toBe(r.saldoCents)

      expect(r.qtdPagas + r.qtdAtrasadas + r.qtdAVencer).toBe(contrato.qtdParcelas)
    }
  })
})

describe('cenários da demonstração', () => {
  const estado = criarEstadoSeed('op-a', DATA_DEMO_INICIAL)

  it('tem cliente sem contrato', () => {
    const semContrato = estado.clientes.filter(
      (c) => !estado.contratos.some((k) => k.clienteId === c.id),
    )
    expect(semContrato.length).toBeGreaterThanOrEqual(1)
  })

  it('tem cliente com dois contratos abertos', () => {
    const porCliente = new Map<string, number>()
    for (const c of estado.contratos) {
      const parcelas = estado.parcelas.filter((p) => p.contratoId === c.id)
      if (situacaoContrato(parcelas, estado.pagamentos, DATA_DEMO_INICIAL) !== 'quitado') {
        porCliente.set(c.clienteId, (porCliente.get(c.clienteId) ?? 0) + 1)
      }
    }
    expect([...porCliente.values()].some((n) => n >= 2)).toBe(true)
  })

  it('tem contrato quitado', () => {
    const quitados = estado.contratos.filter(
      (c) =>
        situacaoContrato(
          estado.parcelas.filter((p) => p.contratoId === c.id),
          estado.pagamentos,
          DATA_DEMO_INICIAL,
        ) === 'quitado',
    )
    expect(quitados.length).toBeGreaterThanOrEqual(1)
  })

  it('tem parcela vencendo hoje, diária atrasada com acréscimo e recebimento do dia', () => {
    const dia = calcularIndicadoresDia(estado, DATA_DEMO_INICIAL)
    expect(dia.qtdPendentesHoje).toBeGreaterThan(0)
    expect(dia.qtdAtrasadas).toBeGreaterThan(0)
    expect(dia.recebidoHojeCents).toBeGreaterThan(0)

    const atrasadaComAcrescimo = estado.parcelas.some((p) => {
      const contrato = estado.contratos.find((c) => c.id === p.contratoId)!
      if (contrato.frequencia !== 'diaria') return false
      if (pagamentoDaParcela(p.id, estado.pagamentos)) return false
      return acrescimoPorAtraso(p, contrato, DATA_DEMO_INICIAL) === p.valorCents
    })
    expect(atrasadaComAcrescimo).toBe(true)
  })

  it('tem pagamento retroativo registrado depois e parcela paga antecipadamente', () => {
    const retroativo = estado.pagamentos.some(
      (p) => p.registradoEm.slice(0, 10) > p.dataPagamento && p.acrescimoCents === 0,
    )
    expect(retroativo).toBe(true)

    const antecipado = estado.pagamentos.some((p) => {
      const parcela = estado.parcelas.find((x) => x.id === p.parcelaIds[0])
      return parcela ? p.dataPagamento < parcela.vencimento : false
    })
    expect(antecipado).toBe(true)
  })

  it('tem contratos semanal e mensal', () => {
    expect(estado.contratos.some((c) => c.frequencia === 'semanal')).toBe(true)
    expect(estado.contratos.some((c) => c.frequencia === 'mensal')).toBe(true)
  })

  it('calcula a carteira a partir dos registros', () => {
    const carteira = calcularIndicadoresCarteira(estado, DATA_DEMO_INICIAL)
    const principalEsperado = estado.parcelas
      .filter((p) => !pagamentoDaParcela(p.id, estado.pagamentos))
      .reduce((s, p) => s + p.principalCents, 0)
    expect(carteira.principalEmAbertoCents).toBe(principalEsperado)
    expect(carteira.totalAReceberCents).toBeGreaterThanOrEqual(carteira.principalEmAbertoCents)
  })

  it('avalia parcela paga com o acréscimo efetivamente cobrado', () => {
    const pagamentoComAcrescimo = estado.pagamentos.find((p) => p.acrescimoCents > 0)!
    const parcela = estado.parcelas.find((p) => p.id === pagamentoComAcrescimo.parcelaIds[0])!
    const contrato = estado.contratos.find((c) => c.id === parcela.contratoId)!
    const cliente = estado.clientes.find((c) => c.id === contrato.clienteId)!
    const avaliada = avaliarParcela(parcela, contrato, cliente, estado.pagamentos, DATA_DEMO_INICIAL)
    expect(avaliada.situacao).toBe('paga')
    expect(avaliada.acrescimoCents).toBe(pagamentoComAcrescimo.acrescimoCents)
  })
})
