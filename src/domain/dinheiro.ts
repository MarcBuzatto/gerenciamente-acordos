/**
 * Dinheiro em centavos inteiros. Nenhum calculo financeiro usa ponto flutuante
 * alem da divisao inteira explicita feita aqui.
 */

export type Centavos = number

export function reaisParaCentavos(valor: number): Centavos {
  return Math.round(valor * 100)
}

export function centavosParaReais(valor: Centavos): number {
  return valor / 100
}

/** Aceita "1.000,50", "1000,50", "1000.50" e "100050" conforme a mascara. */
export function analisarMoeda(texto: string): Centavos | null {
  const limpo = texto.trim()
  if (!limpo) return null
  const soDigitos = limpo.replace(/[^\d]/g, '')
  if (!soDigitos) return null

  const temVirgula = limpo.includes(',')
  const temPonto = limpo.includes('.')

  if (temVirgula) {
    const [inteira, decimal = ''] = limpo.replace(/\./g, '').split(',')
    const centavos = (decimal + '00').slice(0, 2)
    const n = Number(inteira.replace(/\D/g, '') || '0') * 100 + Number(centavos)
    return Number.isFinite(n) ? n : null
  }
  if (temPonto) {
    const partes = limpo.split('.')
    const decimal = partes[partes.length - 1]
    if (decimal.length <= 2 && partes.length === 2) {
      const inteira = partes[0].replace(/\D/g, '') || '0'
      return Number(inteira) * 100 + Number((decimal + '00').slice(0, 2))
    }
    return Number(soDigitos) * 100
  }
  return Number(soDigitos) * 100
}

const FORMATADOR = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatarMoeda(valor: Centavos): string {
  return FORMATADOR.format(valor / 100)
}

/** Sem o prefixo "R$", para tabelas densas. */
export function formatarValor(valor: Centavos): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor / 100)
}

export function formatarPercentual(valor: number): string {
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor)}%`
}

/**
 * Reparte um total inteiro em `quantidade` partes que somam exatamente o total.
 *
 * Metodo: divisao inteira + resto distribuido de um em um centavo nas
 * primeiras parcelas. Deterministico e auditavel.
 */
export function repartir(total: Centavos, quantidade: number): Centavos[] {
  if (quantidade <= 0) return []
  const base = Math.floor(total / quantidade)
  const resto = total - base * quantidade
  return Array.from({ length: quantidade }, (_, i) => base + (i < resto ? 1 : 0))
}

/** Juros contratuais: taxa unica sobre o principal, para o contrato inteiro. */
export function calcularJuros(principal: Centavos, taxaPercent: number): Centavos {
  return Math.round((principal * taxaPercent) / 100)
}

export function somar(valores: Centavos[]): Centavos {
  return valores.reduce((a, b) => a + b, 0)
}
