import {
  compararDatas,
  ehDomingo,
  formatarData,
  rotuloDiaSemana,
  somarDias,
  somarMeses,
  type ISODate,
} from './dates'
import { feriadoEm } from './feriados'
import type { Frequencia } from './tipos'

/**
 * Geracao do calendario de vencimentos.
 *
 * REGRA CONFIRMADA (diaria):
 * - Segunda a sabado contam.
 * - Domingo nao conta.
 * - Feriado aplicavel a Feira de Santana - BA nao conta.
 * - Gera exatamente a quantidade contratada de parcelas.
 *
 * PROPOSTA PENDENTE DE VALIDACAO (semanal e mensal):
 * - Semanal: intervalos de sete dias a partir da data-base.
 * - Mensal: mesmo dia do mes; se inexistente, ultimo dia do mes.
 * - Vencimento que cair em dia excluido avanca para o proximo dia permitido.
 * - O ajuste nao desloca a data-base seguinte (nao e cumulativo).
 */

export interface MotivoBloqueio {
  tipo: 'domingo' | 'feriado'
  descricao: string
}

export function motivoBloqueio(data: ISODate, feriadosAtivos: string[]): MotivoBloqueio | null {
  if (ehDomingo(data)) {
    return { tipo: 'domingo', descricao: 'Domingo' }
  }
  const feriado = feriadoEm(data, feriadosAtivos)
  if (feriado) {
    return { tipo: 'feriado', descricao: feriado.regra.nome }
  }
  return null
}

export function ehDiaPermitido(data: ISODate, feriadosAtivos: string[]): boolean {
  return motivoBloqueio(data, feriadosAtivos) === null
}

/** Avanca ate o proximo dia permitido, inclusive a propria data. */
export function proximoDiaPermitido(data: ISODate, feriadosAtivos: string[]): ISODate {
  let atual = data
  for (let i = 0; i < 400; i += 1) {
    if (ehDiaPermitido(atual, feriadosAtivos)) return atual
    atual = somarDias(atual, 1)
  }
  return atual
}

export interface AjustePrimeiroVencimento {
  original: ISODate
  ajustado: ISODate
  motivo: MotivoBloqueio | null
  explicacao: string | null
}

/**
 * Avalia o primeiro vencimento escolhido. Quando o dia e invalido, devolve a
 * data corrigida e a explicacao a ser exibida antes de salvar.
 */
export function avaliarPrimeiroVencimento(
  data: ISODate,
  feriadosAtivos: string[],
): AjustePrimeiroVencimento {
  const motivo = motivoBloqueio(data, feriadosAtivos)
  if (!motivo) {
    return { original: data, ajustado: data, motivo: null, explicacao: null }
  }
  const ajustado = proximoDiaPermitido(somarDias(data, 1), feriadosAtivos)
  const rotulo = motivo.tipo === 'domingo' ? 'domingo' : `feriado (${motivo.descricao})`
  return {
    original: data,
    ajustado,
    motivo,
    explicacao: `${formatarData(data)} cai em ${rotulo} e não é dia de cobrança. O primeiro vencimento passa para ${formatarData(ajustado)} (${rotuloDiaSemana(ajustado).toLowerCase()}).`,
  }
}

export interface VencimentoGerado {
  numero: number
  data: ISODate
  /** Data teorica antes do ajuste, quando houve deslocamento. */
  dataBase: ISODate
  deslocado: boolean
  motivoDeslocamento: string | null
}

export function gerarVencimentos(
  frequencia: Frequencia,
  primeiroVencimento: ISODate,
  quantidade: number,
  feriadosAtivos: string[],
): VencimentoGerado[] {
  if (quantidade <= 0) return []
  const resultado: VencimentoGerado[] = []

  if (frequencia === 'diaria') {
    let cursor = proximoDiaPermitido(primeiroVencimento, feriadosAtivos)
    for (let i = 0; i < quantidade; i += 1) {
      const motivo = i === 0 ? motivoBloqueio(primeiroVencimento, feriadosAtivos) : null
      resultado.push({
        numero: i + 1,
        data: cursor,
        dataBase: i === 0 ? primeiroVencimento : cursor,
        deslocado: i === 0 && cursor !== primeiroVencimento,
        motivoDeslocamento: motivo ? motivo.descricao : null,
      })
      cursor = proximoDiaPermitido(somarDias(cursor, 1), feriadosAtivos)
    }
    return resultado
  }

  // Semanal e mensal: a data-base e sempre calculada a partir do primeiro
  // vencimento informado; o ajuste de dia excluido nunca e cumulativo.
  const base = primeiroVencimento
  for (let i = 0; i < quantidade; i += 1) {
    const dataBase = frequencia === 'semanal' ? somarDias(base, 7 * i) : somarMeses(base, i)
    const motivo = motivoBloqueio(dataBase, feriadosAtivos)
    const data = proximoDiaPermitido(dataBase, feriadosAtivos)
    resultado.push({
      numero: i + 1,
      data,
      dataBase,
      deslocado: data !== dataBase,
      motivoDeslocamento: motivo ? motivo.descricao : null,
    })
  }
  return resultado
}

export function ordenarPorVencimento<T extends { vencimento: ISODate }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => compararDatas(a.vencimento, b.vencimento))
}

export const RESUMO_REGRAS_CALENDARIO: Record<Frequencia, string> = {
  diaria:
    'Segunda a sábado. Domingos e feriados de Feira de Santana–BA não contam. A quantidade contratada de parcelas é sempre gerada.',
  semanal:
    'Intervalos de sete dias a partir do primeiro vencimento. Vencimento em domingo ou feriado avança para o próximo dia permitido, sem deslocar as datas seguintes. Regra provisória.',
  mensal:
    'Mesmo dia do mês; quando o dia não existe, usa o último dia do mês. Vencimento em domingo ou feriado avança para o próximo dia permitido, sem deslocar as datas seguintes. Regra provisória.',
}
