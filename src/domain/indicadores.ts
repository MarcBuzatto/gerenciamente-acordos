import { compararDatas, type ISODate } from './dates'
import type { Centavos } from './dinheiro'
import {
  acrescimoPorAtraso,
  avaliarParcela,
  pagamentoAtivo,
  pagamentoDaParcela,
  situacaoContrato,
} from './cobranca'
import type {
  Cliente,
  Contrato,
  EstadoOperacao,
  Pagamento,
  Parcela,
  ParcelaAvaliada,
  SituacaoContrato,
} from './tipos'

/**
 * Indicadores derivados sempre dos registros. Nenhum numero decorativo.
 *
 * Vocabulario deliberado:
 * - "Principal em aberto": soma das partes de principal das parcelas nao pagas.
 *   Nao e "capital de giro" nem "saldo de caixa".
 * - "Total a receber": soma do valor devido de todas as parcelas em aberto na
 *   data de referencia, ja com o acrescimo das diarias vencidas.
 * Nenhum dos dois e apresentado como lucro.
 */

export interface IndicadoresDia {
  dataReferencia: ISODate
  recebidoHojeCents: Centavos
  pendenteHojeCents: Centavos
  qtdPendentesHoje: number
  totalAtrasadoCents: Centavos
  qtdAtrasadas: number
  qtdRecebimentosHoje: number
}

export interface IndicadoresCarteira {
  principalEmAbertoCents: Centavos
  totalAReceberCents: Centavos
  acrescimosEmAbertoCents: Centavos
  contratosAbertos: number
  contratosAtrasados: number
}

export function indiceParcelasPorContrato(parcelas: Parcela[]): Map<string, Parcela[]> {
  const mapa = new Map<string, Parcela[]>()
  for (const p of parcelas) {
    const lista = mapa.get(p.contratoId)
    if (lista) lista.push(p)
    else mapa.set(p.contratoId, [p])
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.numero - b.numero)
  return mapa
}

export function avaliarTodasParcelas(
  estado: EstadoOperacao,
  dataReferencia: ISODate,
): ParcelaAvaliada[] {
  const clientes = new Map(estado.clientes.map((c) => [c.id, c]))
  const contratos = new Map(estado.contratos.map((c) => [c.id, c]))
  const resultado: ParcelaAvaliada[] = []
  for (const parcela of estado.parcelas) {
    const contrato = contratos.get(parcela.contratoId)
    if (!contrato) continue
    const cliente = clientes.get(contrato.clienteId)
    if (!cliente) continue
    resultado.push(avaliarParcela(parcela, contrato, cliente, estado.pagamentos, dataReferencia))
  }
  return resultado
}

export function calcularIndicadoresDia(
  estado: EstadoOperacao,
  dataReferencia: ISODate,
): IndicadoresDia {
  const avaliadas = avaliarTodasParcelas(estado, dataReferencia)

  const pendentesHoje = avaliadas.filter((a) => a.situacao === 'hoje')
  const atrasadas = avaliadas.filter((a) => a.situacao === 'atrasada')

  // O painel usa a data real do recebimento, nunca a data de digitacao.
  const recebimentosHoje = estado.pagamentos.filter(
    (p) => pagamentoAtivo(p) && p.dataPagamento === dataReferencia,
  )

  return {
    dataReferencia,
    recebidoHojeCents: recebimentosHoje.reduce((s, p) => s + p.valorTotalCents, 0),
    qtdRecebimentosHoje: recebimentosHoje.length,
    pendenteHojeCents: pendentesHoje.reduce((s, a) => s + a.totalDevidoCents, 0),
    qtdPendentesHoje: pendentesHoje.length,
    totalAtrasadoCents: atrasadas.reduce((s, a) => s + a.totalDevidoCents, 0),
    qtdAtrasadas: atrasadas.length,
  }
}

export function calcularIndicadoresCarteira(
  estado: EstadoOperacao,
  dataReferencia: ISODate,
): IndicadoresCarteira {
  const porContrato = indiceParcelasPorContrato(estado.parcelas)
  let principalEmAberto = 0
  let totalAReceber = 0
  let acrescimos = 0
  let abertos = 0
  let atrasados = 0

  for (const contrato of estado.contratos) {
    const parcelas = porContrato.get(contrato.id) ?? []
    const situacao = situacaoContrato(parcelas, estado.pagamentos, dataReferencia)
    if (situacao !== 'quitado') abertos += 1
    if (situacao === 'atrasado') atrasados += 1

    for (const parcela of parcelas) {
      if (pagamentoDaParcela(parcela.id, estado.pagamentos)) continue
      const acrescimo = acrescimoPorAtraso(parcela, contrato, dataReferencia)
      principalEmAberto += parcela.principalCents
      totalAReceber += parcela.valorCents + acrescimo
      acrescimos += acrescimo
    }
  }

  return {
    principalEmAbertoCents: principalEmAberto,
    totalAReceberCents: totalAReceber,
    acrescimosEmAbertoCents: acrescimos,
    contratosAbertos: abertos,
    contratosAtrasados: atrasados,
  }
}

export interface ResumoContratoCalculado {
  contrato: Contrato
  cliente: Cliente
  parcelas: Parcela[]
  avaliadas: ParcelaAvaliada[]
  situacao: SituacaoContrato
  totalPagoCents: Centavos
  acrescimosPagosCents: Centavos
  saldoCents: Centavos
  qtdPagas: number
  qtdAtrasadas: number
  qtdAVencer: number
  pagamentos: Pagamento[]
  proximoVencimento: ISODate | null
}

export function resumirContrato(
  estado: EstadoOperacao,
  contrato: Contrato,
  dataReferencia: ISODate,
): ResumoContratoCalculado | null {
  const cliente = estado.clientes.find((c) => c.id === contrato.clienteId)
  if (!cliente) return null
  const parcelas = estado.parcelas
    .filter((p) => p.contratoId === contrato.id)
    .sort((a, b) => a.numero - b.numero)
  const avaliadas = parcelas.map((p) =>
    avaliarParcela(p, contrato, cliente, estado.pagamentos, dataReferencia),
  )
  const pagamentos = estado.pagamentos
    .filter((p) => p.contratoId === contrato.id)
    .sort((a, b) => compararDatas(a.dataPagamento, b.dataPagamento) || (a.registradoEm < b.registradoEm ? -1 : 1))
  const ativos = pagamentos.filter(pagamentoAtivo)

  const emAberto = avaliadas.filter((a) => a.situacao !== 'paga')
  const proximo = emAberto.length ? emAberto[0].parcela.vencimento : null

  return {
    contrato,
    cliente,
    parcelas,
    avaliadas,
    situacao: situacaoContrato(parcelas, estado.pagamentos, dataReferencia),
    totalPagoCents: ativos.reduce((s, p) => s + p.valorTotalCents, 0),
    acrescimosPagosCents: ativos.reduce((s, p) => s + p.acrescimoCents, 0),
    saldoCents: emAberto.reduce((s, a) => s + a.totalDevidoCents, 0),
    qtdPagas: avaliadas.filter((a) => a.situacao === 'paga').length,
    qtdAtrasadas: avaliadas.filter((a) => a.situacao === 'atrasada').length,
    qtdAVencer: avaliadas.filter((a) => a.situacao === 'hoje' || a.situacao === 'a_vencer').length,
    pagamentos,
    proximoVencimento: proximo,
  }
}
