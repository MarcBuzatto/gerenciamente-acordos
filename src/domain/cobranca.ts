import { compararDatas, diferencaDias, type ISODate } from './dates'
import type { Centavos } from './dinheiro'
import type {
  Cliente,
  Contrato,
  Pagamento,
  Parcela,
  ParcelaAvaliada,
  SituacaoContrato,
  SituacaoParcela,
} from './tipos'

/**
 * Regras de atraso.
 *
 * REGRA CONFIRMADA (diaria):
 * - A diaria nao paga dobra uma unica vez, no dia seguinte ao vencimento.
 * - Depois disso o valor fica congelado.
 * - Cada diaria e tratada isoladamente.
 * - O acrescimo ocorre inclusive quando o dia seguinte e domingo ou feriado.
 * - Nao ha capitalizacao diaria adicional.
 *
 *   vencimento .......... R$ 70,00
 *   dia seguinte ........ R$ 140,00
 *   dez dias depois ..... R$ 140,00
 *
 * PENDENTE DE VALIDACAO (semanal e mensal):
 * A regra de dobra nao foi estendida. Nessas frequencias o atraso e apenas
 * identificado, sem acrescimo na demonstracao.
 */

export function acrescimoPorAtraso(
  parcela: Parcela,
  contrato: Contrato,
  emData: ISODate,
): Centavos {
  if (contrato.frequencia !== 'diaria') return 0
  return compararDatas(emData, parcela.vencimento) > 0 ? parcela.valorCents : 0
}

export function valorDevido(parcela: Parcela, contrato: Contrato, emData: ISODate): Centavos {
  return parcela.valorCents + acrescimoPorAtraso(parcela, contrato, emData)
}

export function pagamentoAtivo(p: Pagamento): boolean {
  return !p.estorno
}

export function pagamentoDaParcela(
  parcelaId: string,
  pagamentos: Pagamento[],
): Pagamento | null {
  return pagamentos.find((p) => pagamentoAtivo(p) && p.parcelaIds.includes(parcelaId)) ?? null
}

export function situacaoParcela(
  parcela: Parcela,
  pagamento: Pagamento | null,
  dataReferencia: ISODate,
): SituacaoParcela {
  if (pagamento) return 'paga'
  const cmp = compararDatas(parcela.vencimento, dataReferencia)
  if (cmp < 0) return 'atrasada'
  if (cmp === 0) return 'hoje'
  return 'a_vencer'
}

export function avaliarParcela(
  parcela: Parcela,
  contrato: Contrato,
  cliente: Cliente,
  pagamentos: Pagamento[],
  dataReferencia: ISODate,
): ParcelaAvaliada {
  const pagamento = pagamentoDaParcela(parcela.id, pagamentos)
  const situacao = situacaoParcela(parcela, pagamento, dataReferencia)
  const acrescimo = pagamento
    ? (pagamento.itens.find((i) => i.parcelaId === parcela.id)?.acrescimoCents ?? 0)
    : acrescimoPorAtraso(parcela, contrato, dataReferencia)

  return {
    parcela,
    contrato,
    cliente,
    situacao,
    pagamento,
    valorOriginalCents: parcela.valorCents,
    acrescimoCents: acrescimo,
    totalDevidoCents: parcela.valorCents + acrescimo,
    diasDeAtraso:
      situacao === 'atrasada' ? diferencaDias(parcela.vencimento, dataReferencia) : 0,
  }
}

export function situacaoContrato(
  parcelas: Parcela[],
  pagamentos: Pagamento[],
  dataReferencia: ISODate,
): SituacaoContrato {
  const emAberto = parcelas.filter((p) => !pagamentoDaParcela(p.id, pagamentos))
  if (emAberto.length === 0) return 'quitado'
  const temAtraso = emAberto.some((p) => compararDatas(p.vencimento, dataReferencia) < 0)
  return temAtraso ? 'atrasado' : 'em_dia'
}

export interface ResumoQuitacao {
  parcelas: ParcelaAvaliada[]
  valorOriginalCents: Centavos
  acrescimoCents: Centavos
  totalCents: Centavos
}

/**
 * Quitacao antecipada: cobra o saldo integral devido na data escolhida, sem
 * desconto dos juros contratuais. Parcelas ainda nao vencidas entram pelo
 * valor original, sem acrescimo.
 */
export function montarQuitacao(
  parcelas: Parcela[],
  contrato: Contrato,
  cliente: Cliente,
  pagamentos: Pagamento[],
  emData: ISODate,
): ResumoQuitacao {
  const abertas = parcelas
    .filter((p) => !pagamentoDaParcela(p.id, pagamentos))
    .sort((a, b) => a.numero - b.numero)
    .map((p) => {
      const acrescimo = acrescimoPorAtraso(p, contrato, emData)
      return {
        parcela: p,
        contrato,
        cliente,
        situacao: situacaoParcela(p, null, emData),
        pagamento: null,
        valorOriginalCents: p.valorCents,
        acrescimoCents: acrescimo,
        totalDevidoCents: p.valorCents + acrescimo,
        diasDeAtraso:
          compararDatas(p.vencimento, emData) < 0 ? diferencaDias(p.vencimento, emData) : 0,
      } satisfies ParcelaAvaliada
    })

  return {
    parcelas: abertas,
    valorOriginalCents: abertas.reduce((s, p) => s + p.valorOriginalCents, 0),
    acrescimoCents: abertas.reduce((s, p) => s + p.acrescimoCents, 0),
    totalCents: abertas.reduce((s, p) => s + p.totalDevidoCents, 0),
  }
}

export const ROTULO_SITUACAO_PARCELA: Record<SituacaoParcela, string> = {
  paga: 'Pago',
  atrasada: 'Atrasado',
  hoje: 'Vence hoje',
  a_vencer: 'A vencer',
}

export const ROTULO_SITUACAO_CONTRATO: Record<SituacaoContrato, string> = {
  quitado: 'Quitado',
  atrasado: 'Em atraso',
  em_dia: 'Em dia',
}
