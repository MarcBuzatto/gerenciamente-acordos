import { gerarVencimentos, type VencimentoGerado } from './calendario'
import { calcularJuros, repartir, somar, type Centavos } from './dinheiro'
import type { ISODate } from './dates'
import type { Contrato, Frequencia, Parcela } from './tipos'

/**
 * Montagem do contrato e das parcelas.
 *
 * REGRA CONFIRMADA: a taxa incide uma unica vez sobre o principal, para o
 * contrato inteiro. Nao ha juros por periodo nem capitalizacao.
 *
 *   principal = 100.000 centavos, taxa = 40%
 *   juros     = 40.000
 *   total     = 140.000
 *   20 parcelas de 7.000
 *
 * COMPOSICAO PRINCIPAL/JUROS POR PARCELA (proposta tecnica a validar):
 * principal e juros sao repartidos separadamente entre as parcelas, cada um
 * com divisao inteira e resto de um centavo nas primeiras. O valor da parcela
 * e a soma das duas partes. Isso garante ao mesmo tempo:
 *   soma(valorParcela)     === total
 *   soma(principalParcela) === principal
 *   soma(jurosParcela)     === juros
 * Como nao existe pagamento parcial, cada parcela quitada transporta a
 * composicao inteira. Acrescimo por atraso fica fora dessa composicao e e
 * sempre contabilizado a parte.
 */

export interface ResumoContrato {
  principalCents: Centavos
  taxaPercent: number
  jurosCents: Centavos
  totalCents: Centavos
  qtdParcelas: number
  valorParcelaCents: Centavos
  valoresParcelas: Centavos[]
  parcelasDesiguais: boolean
  vencimentos: VencimentoGerado[]
}

export function montarResumoContrato(entrada: {
  principalCents: Centavos
  taxaPercent: number
  frequencia: Frequencia
  qtdParcelas: number
  primeiroVencimento: ISODate
  feriadosAtivos: string[]
}): ResumoContrato {
  const jurosCents = calcularJuros(entrada.principalCents, entrada.taxaPercent)
  const totalCents = entrada.principalCents + jurosCents
  const partesPrincipal = repartir(entrada.principalCents, entrada.qtdParcelas)
  const partesJuros = repartir(jurosCents, entrada.qtdParcelas)
  const valoresParcelas = partesPrincipal.map((p, i) => p + partesJuros[i])
  const vencimentos = gerarVencimentos(
    entrada.frequencia,
    entrada.primeiroVencimento,
    entrada.qtdParcelas,
    entrada.feriadosAtivos,
  )

  return {
    principalCents: entrada.principalCents,
    taxaPercent: entrada.taxaPercent,
    jurosCents,
    totalCents,
    qtdParcelas: entrada.qtdParcelas,
    valorParcelaCents: valoresParcelas[0] ?? 0,
    valoresParcelas,
    parcelasDesiguais: new Set(valoresParcelas).size > 1,
    vencimentos,
  }
}

export function gerarParcelas(
  contrato: Contrato,
  feriadosAtivos: string[],
  idParcela: (indice: number) => string,
): Parcela[] {
  const partesPrincipal = repartir(contrato.principalCents, contrato.qtdParcelas)
  const partesJuros = repartir(contrato.jurosCents, contrato.qtdParcelas)
  const vencimentos = gerarVencimentos(
    contrato.frequencia,
    contrato.primeiroVencimento,
    contrato.qtdParcelas,
    feriadosAtivos,
  )

  return vencimentos.map((v, i) => ({
    id: idParcela(i),
    operacaoId: contrato.operacaoId,
    contratoId: contrato.id,
    numero: v.numero,
    vencimento: v.data,
    valorCents: partesPrincipal[i] + partesJuros[i],
    principalCents: partesPrincipal[i],
    jurosCents: partesJuros[i],
  }))
}

/** Verificacao usada em teste e na tela de conferencia. */
export function fechaComTotal(resumo: ResumoContrato): boolean {
  return somar(resumo.valoresParcelas) === resumo.totalCents
}
