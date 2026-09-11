import { somarDias, somarMeses, type ISODate } from '../domain/dates'
import { proximoDiaPermitido, ehDiaPermitido } from '../domain/calendario'
import { acrescimoPorAtraso } from '../domain/cobranca'
import { gerarParcelas } from '../domain/contratos'
import { calcularJuros } from '../domain/dinheiro'
import { IDS_FERIADO_PADRAO } from '../domain/feriados'
import type {
  Contrato,
  Cliente,
  EstadoOperacao,
  Evento,
  Frequencia,
  Operacao,
  Pagamento,
  Parcela,
  Usuario,
} from '../domain/tipos'

/**
 * Dados ficticios da demonstracao.
 *
 * Nada aqui vem do contrato real usado como referencia de layout. Nomes,
 * telefones, documentos e enderecos sao inventados para a demonstracao.
 *
 * A data de referencia inicial e fixa para que os cenarios continuem
 * demonstraveis; a ferramenta da demonstracao permite altera-la.
 */

export const DATA_DEMO_INICIAL: ISODate = '2026-09-11'

export const OPERACOES: Operacao[] = [
  { id: 'op-a', nome: 'Operação Tomba', responsavel: 'Marcos Vieira', cidade: 'Feira de Santana – BA' },
  { id: 'op-b', nome: 'Operação Centro', responsavel: 'Elaine Passos', cidade: 'Feira de Santana – BA' },
]

export const USUARIOS: Usuario[] = [
  { id: 'u-a-prop', operacaoId: 'op-a', nome: 'Marcos Vieira', perfil: 'proprietario', telefone: '(75) 9 9000-0001' },
  { id: 'u-a-assist', operacaoId: 'op-a', nome: 'Jussara Lima', perfil: 'assistente', telefone: '(75) 9 9000-0002' },
  { id: 'u-b-prop', operacaoId: 'op-b', nome: 'Elaine Passos', perfil: 'proprietario', telefone: '(75) 9 9000-0003' },
  { id: 'u-b-assist', operacaoId: 'op-b', nome: 'Gilmar Rocha', perfil: 'assistente', telefone: '(75) 9 9000-0004' },
]

const FERIADOS = IDS_FERIADO_PADRAO

/** Volta N dias de cobranca a partir de uma data (pula domingo e feriado). */
function diasUteisAntes(data: ISODate, n: number): ISODate {
  let cursor = data
  let restantes = n
  while (restantes > 0) {
    cursor = somarDias(cursor, -1)
    if (ehDiaPermitido(cursor, FERIADOS)) restantes -= 1
  }
  return cursor
}

function diasUteisDepois(data: ISODate, n: number): ISODate {
  let cursor = data
  let restantes = n
  while (restantes > 0) {
    cursor = somarDias(cursor, 1)
    if (ehDiaPermitido(cursor, FERIADOS)) restantes -= 1
  }
  return cursor
}

interface PagamentoSeed {
  /** Numero da parcela (1-based). */
  parcela: number
  /** `'vencimento'` paga no dia, `'hoje'` na data de referencia, ou data civil. */
  em?: 'vencimento' | 'hoje' | ISODate
  /** Dias corridos entre o recebimento e a digitacao. Padrao 0. */
  atrasoDeRegistro?: number
  /** Hora da digitacao, so para o historico. */
  hora?: string
  porAssistente?: boolean
}

interface ContratoSeed {
  numero: number
  clienteRef: string
  principalReais: number
  taxaPercent: number
  frequencia: Frequencia
  qtdParcelas: number
  /** Deslocamento do primeiro vencimento em relacao a data de referencia. */
  primeiroVencimento:
    | { tipo: 'diasUteisAntes'; valor: number }
    | { tipo: 'diasAntes'; valor: number }
    | { tipo: 'mesesAntes'; valor: number }
  cadastroDiasAntesDoVencimento: number
  observacao?: string
  pagas: PagamentoSeed[]
}

type DadosCliente = Omit<Cliente, 'id' | 'operacaoId' | 'criadoEm'>

interface ClienteSeed extends DadosCliente {
  ref: string
}

interface OperacaoSeed {
  operacaoId: string
  proprietarioId: string
  assistenteId: string
  clientes: ClienteSeed[]
  contratos: ContratoSeed[]
}

const SEED_A: OperacaoSeed = {
  operacaoId: 'op-a',
  proprietarioId: 'u-a-prop',
  assistenteId: 'u-a-assist',
  clientes: [
    {
      ref: 'adriano',
      nome: 'Adriano Ferreira de Souza',
      telefone: '(75) 9 8101-2233',
      cpfCnpj: '123.456.789-00',
      email: 'adriano.souza@exemplo.com.br',
      nascimento: '1988-03-14',
      cep: '44001-000',
      rua: 'Rua das Mangueiras',
      numero: '145',
      complemento: 'Fundos',
      cidade: 'Feira de Santana',
      estado: 'BA',
      veiculoTipo: 'moto',
      veiculoCondicao: 'proprio',
      placa: 'PQR1A23',
    },
    {
      ref: 'cleide',
      nome: 'Cleide Nascimento Rocha',
      telefone: '(75) 9 8102-4455',
      cpfCnpj: '987.654.321-00',
      cidade: 'Feira de Santana',
      estado: 'BA',
      rua: 'Avenida Getúlio Vargas',
      numero: '890',
      veiculoTipo: '',
      veiculoCondicao: '',
    },
    {
      ref: 'railson',
      nome: 'Railson Moreira Dantas',
      telefone: '(75) 9 8103-6677',
      rg: '12.345.678-9',
      cidade: 'Feira de Santana',
      estado: 'BA',
      veiculoTipo: 'carro',
      veiculoCondicao: 'alugado',
      placa: 'STU2B34',
    },
    {
      ref: 'tatiane',
      nome: 'Tatiane Cardoso Lima',
      telefone: '(75) 9 8104-8899',
      email: 'tatiane.lima@exemplo.com.br',
      cidade: 'Feira de Santana',
      estado: 'BA',
    },
    {
      ref: 'wesley',
      nome: 'Wesley Andrade Pinto',
      telefone: '(75) 9 8105-1010',
      cidade: 'Feira de Santana',
      estado: 'BA',
    },
    {
      ref: 'marlene',
      nome: 'Marlene Batista dos Santos',
      telefone: '(75) 9 8106-2020',
      cpfCnpj: '456.789.123-00',
      cidade: 'Feira de Santana',
      estado: 'BA',
      veiculoTipo: 'moto',
      veiculoCondicao: 'alugado',
      placa: 'VWX3C45',
    },
  ],
  contratos: [
    {
      numero: 101,
      clienteRef: 'adriano',
      principalReais: 1000,
      taxaPercent: 40,
      frequencia: 'diaria',
      qtdParcelas: 20,
      primeiroVencimento: { tipo: 'diasUteisAntes', valor: 12 },
      cadastroDiasAntesDoVencimento: 1,
      observacao: 'Recebe na banca do Tomba, pela manhã.',
      pagas: Array.from({ length: 12 }, (_, i) => ({ parcela: i + 1, em: 'vencimento' as const })),
    },
    {
      numero: 102,
      clienteRef: 'adriano',
      principalReais: 600,
      taxaPercent: 30,
      frequencia: 'semanal',
      qtdParcelas: 6,
      primeiroVencimento: { tipo: 'diasAntes', valor: 21 },
      cadastroDiasAntesDoVencimento: 2,
      observacao: 'Segundo contrato. Não substitui o contrato 101.',
      pagas: [
        { parcela: 1, em: 'vencimento' },
        { parcela: 2, em: 'vencimento' },
      ],
    },
    {
      numero: 103,
      clienteRef: 'cleide',
      principalReais: 500,
      taxaPercent: 40,
      frequencia: 'diaria',
      qtdParcelas: 10,
      primeiroVencimento: { tipo: 'diasUteisAntes', valor: 6 },
      cadastroDiasAntesDoVencimento: 1,
      pagas: [
        { parcela: 1, em: 'vencimento' },
        { parcela: 2, em: 'vencimento' },
        { parcela: 3, em: 'vencimento' },
        // Diaria atrasada quitada hoje, ja com o acrescimo unico.
        { parcela: 4, em: 'hoje', porAssistente: true, hora: '09:12' },
      ],
    },
    {
      numero: 104,
      clienteRef: 'railson',
      principalReais: 1000,
      taxaPercent: 40,
      frequencia: 'diaria',
      qtdParcelas: 20,
      primeiroVencimento: { tipo: 'diasUteisAntes', valor: 32 },
      cadastroDiasAntesDoVencimento: 1,
      observacao: 'Contrato encerrado.',
      pagas: Array.from({ length: 20 }, (_, i) => ({ parcela: i + 1, em: 'vencimento' as const })),
    },
    {
      numero: 105,
      clienteRef: 'tatiane',
      principalReais: 2000,
      taxaPercent: 20,
      frequencia: 'mensal',
      qtdParcelas: 4,
      primeiroVencimento: { tipo: 'mesesAntes', valor: 2 },
      cadastroDiasAntesDoVencimento: 5,
      observacao: 'Mensal — regra de atraso ainda pendente de validação.',
      pagas: [{ parcela: 1, em: 'vencimento' }],
    },
    {
      numero: 106,
      clienteRef: 'marlene',
      principalReais: 800,
      taxaPercent: 40,
      frequencia: 'diaria',
      qtdParcelas: 16,
      primeiroVencimento: { tipo: 'diasUteisAntes', valor: 8 },
      cadastroDiasAntesDoVencimento: 1,
      pagas: [
        { parcela: 1, em: 'vencimento' },
        { parcela: 2, em: 'vencimento' },
        { parcela: 3, em: 'vencimento' },
        { parcela: 4, em: 'vencimento' },
        { parcela: 5, em: 'vencimento' },
        { parcela: 6, em: 'vencimento' },
        // Recebida no vencimento, digitada dois dias depois: sem acrescimo e
        // contabilizada na data real do recebimento.
        { parcela: 7, em: 'vencimento', atrasoDeRegistro: 2, hora: '20:40', porAssistente: true },
        { parcela: 8, em: 'vencimento' },
        // Parcela paga antecipadamente: vence depois, recebida hoje.
        { parcela: 10, em: 'hoje', hora: '08:05' },
      ],
    },
  ],
}

const SEED_B: OperacaoSeed = {
  operacaoId: 'op-b',
  proprietarioId: 'u-b-prop',
  assistenteId: 'u-b-assist',
  clientes: [
    {
      ref: 'nubia',
      nome: 'Núbia Teixeira Alves',
      telefone: '(75) 9 8207-3030',
      cidade: 'Feira de Santana',
      estado: 'BA',
    },
    {
      ref: 'ricardo',
      nome: 'Ricardo Amorim Silva',
      telefone: '(75) 9 8208-4040',
      cpfCnpj: '321.654.987-00',
      cidade: 'Feira de Santana',
      estado: 'BA',
      veiculoTipo: 'carro',
      veiculoCondicao: 'proprio',
      placa: 'YZA4D56',
    },
    {
      ref: 'sandra',
      nome: 'Sandra Oliveira Meneses',
      telefone: '(75) 9 8209-5050',
      cidade: 'Feira de Santana',
      estado: 'BA',
    },
  ],
  contratos: [
    {
      numero: 201,
      clienteRef: 'nubia',
      principalReais: 1500,
      taxaPercent: 40,
      frequencia: 'diaria',
      qtdParcelas: 30,
      primeiroVencimento: { tipo: 'diasUteisAntes', valor: 9 },
      cadastroDiasAntesDoVencimento: 1,
      pagas: Array.from({ length: 9 }, (_, i) => ({ parcela: i + 1, em: 'vencimento' as const })),
    },
    {
      numero: 202,
      clienteRef: 'ricardo',
      principalReais: 700,
      taxaPercent: 40,
      frequencia: 'diaria',
      qtdParcelas: 14,
      primeiroVencimento: { tipo: 'diasUteisAntes', valor: 5 },
      cadastroDiasAntesDoVencimento: 1,
      pagas: [{ parcela: 1, em: 'vencimento' }],
    },
    {
      numero: 203,
      clienteRef: 'sandra',
      principalReais: 1200,
      taxaPercent: 25,
      frequencia: 'semanal',
      qtdParcelas: 5,
      primeiroVencimento: { tipo: 'diasAntes', valor: 7 },
      cadastroDiasAntesDoVencimento: 3,
      pagas: [{ parcela: 1, em: 'vencimento' }],
    },
  ],
}

const SEEDS: Record<string, OperacaoSeed> = { 'op-a': SEED_A, 'op-b': SEED_B }

function resolverPrimeiroVencimento(
  spec: ContratoSeed['primeiroVencimento'],
  dataRef: ISODate,
): ISODate {
  if (spec.tipo === 'diasUteisAntes') return diasUteisAntes(dataRef, spec.valor)
  if (spec.tipo === 'diasAntes') return proximoDiaPermitido(somarDias(dataRef, -spec.valor), FERIADOS)
  return proximoDiaPermitido(somarMeses(dataRef, -spec.valor), FERIADOS)
}

export function criarEstadoSeed(operacaoId: string, dataRef: ISODate): EstadoOperacao {
  const seed = SEEDS[operacaoId]
  const clientes: Cliente[] = []
  const contratos: Contrato[] = []
  const parcelas: Parcela[] = []
  const pagamentos: Pagamento[] = []
  const eventos: Evento[] = []

  if (!seed) {
    return {
      clientes,
      contratos,
      parcelas,
      pagamentos,
      eventos,
      config: { feriadosAtivos: [...IDS_FERIADO_PADRAO] },
      proximoNumeroContrato: 1,
    }
  }

  const refPorId = new Map<string, string>()

  seed.clientes.forEach((c, i) => {
    const { ref, ...resto } = c
    const id = `${operacaoId}-cli-${i + 1}`
    refPorId.set(ref, id)
    const criadoEm = `${diasUteisAntes(dataRef, 40 - i)}T09:${String(10 + i).padStart(2, '0')}:00.000-03:00`
    clientes.push({ ...resto, id, operacaoId, criadoEm })
    eventos.push({
      id: `${operacaoId}-ev-cli-${i + 1}`,
      operacaoId,
      tipo: 'cliente_criado',
      em: criadoEm,
      por: seed.proprietarioId,
      clienteId: id,
      descricao: `Cliente ${c.nome} cadastrado.`,
    })
  })

  seed.contratos.forEach((cs, ci) => {
    const clienteId = refPorId.get(cs.clienteRef)!
    const primeiroVencimento = resolverPrimeiroVencimento(cs.primeiroVencimento, dataRef)
    const principalCents = cs.principalReais * 100
    const jurosCents = calcularJuros(principalCents, cs.taxaPercent)
    const dataContrato = somarDias(primeiroVencimento, -cs.cadastroDiasAntesDoVencimento)
    const contratoId = `${operacaoId}-ctr-${cs.numero}`

    const contrato: Contrato = {
      id: contratoId,
      operacaoId,
      clienteId,
      numero: cs.numero,
      principalCents,
      taxaPercent: cs.taxaPercent,
      jurosCents,
      totalCents: principalCents + jurosCents,
      frequencia: cs.frequencia,
      qtdParcelas: cs.qtdParcelas,
      primeiroVencimento,
      dataContrato,
      observacao: cs.observacao,
      criadoEm: `${dataContrato}T10:${String(15 + ci).padStart(2, '0')}:00.000-03:00`,
      criadoPor: seed.proprietarioId,
    }
    contratos.push(contrato)
    eventos.push({
      id: `${operacaoId}-ev-ctr-${cs.numero}`,
      operacaoId,
      tipo: 'contrato_criado',
      em: contrato.criadoEm,
      por: seed.proprietarioId,
      contratoId,
      clienteId,
      descricao: `Contrato ${cs.numero} criado.`,
    })

    const doContrato = gerarParcelas(contrato, FERIADOS, (i) => `${contratoId}-p-${i + 1}`)
    parcelas.push(...doContrato)

    cs.pagas.forEach((ps, pi) => {
      const parcela = doContrato[ps.parcela - 1]
      if (!parcela) return
      const dataPagamento =
        ps.em === undefined || ps.em === 'vencimento'
          ? parcela.vencimento
          : ps.em === 'hoje'
            ? dataRef
            : ps.em
      const acrescimo = acrescimoPorAtraso(parcela, contrato, dataPagamento)
      const registradoData = somarDias(dataPagamento, ps.atrasoDeRegistro ?? 0)
      const hora = ps.hora ?? `1${(pi % 8) + 1}:${String((pi * 7) % 60).padStart(2, '0')}`
      const pagamentoId = `${contratoId}-pag-${ps.parcela}`
      const por = ps.porAssistente ? seed.assistenteId : seed.proprietarioId

      pagamentos.push({
        id: pagamentoId,
        operacaoId,
        contratoId,
        parcelaIds: [parcela.id],
        itens: [
          {
            parcelaId: parcela.id,
            valorOriginalCents: parcela.valorCents,
            acrescimoCents: acrescimo,
          },
        ],
        dataPagamento,
        registradoEm: `${registradoData}T${hora}:00.000-03:00`,
        registradoPor: por,
        valorOriginalCents: parcela.valorCents,
        acrescimoCents: acrescimo,
        valorTotalCents: parcela.valorCents + acrescimo,
        meio: 'pix',
        tipo: 'parcela',
      })
      eventos.push({
        id: `${pagamentoId}-ev`,
        operacaoId,
        tipo: 'pagamento_registrado',
        em: `${registradoData}T${hora}:00.000-03:00`,
        por,
        contratoId,
        clienteId,
        pagamentoId,
        descricao: `Parcela ${parcela.numero} recebida por Pix.`,
      })
    })
  })

  const maiorNumero = contratos.reduce((m, c) => Math.max(m, c.numero), 0)

  return {
    clientes,
    contratos,
    parcelas,
    pagamentos,
    eventos,
    config: { feriadosAtivos: [...IDS_FERIADO_PADRAO] },
    proximoNumeroContrato: maiorNumero + 1,
  }
}

export { diasUteisAntes, diasUteisDepois }
