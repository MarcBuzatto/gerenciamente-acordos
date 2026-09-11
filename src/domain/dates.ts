/**
 * Datas civis (sem fuso, sem horário).
 *
 * Vencimentos e datas de pagamento sao datas civis no formato ISO `AAAA-MM-DD`.
 * Nenhuma operacao usa `Date` com fuso horario, o que elimina o deslocamento de
 * um dia que costuma aparecer entre America/Bahia (UTC-3) e UTC.
 *
 * A referencia operacional e America/Bahia. Como o estado da Bahia nao adota
 * horario de verao, o deslocamento e fixo em -03:00.
 */

export type ISODate = string // AAAA-MM-DD
export type ISODateTime = string // ISO 8601 completo

const OFFSET_BAHIA_MINUTOS = -180

export function isISODate(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [a, m, d] = valor.split('-').map(Number)
  if (m < 1 || m > 12) return false
  return d >= 1 && d <= diasNoMes(a, m)
}

export function diasNoMes(ano: number, mes: number): number {
  return [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
}

export function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

export function criarData(ano: number, mes: number, dia: number): ISODate {
  const mm = String(mes).padStart(2, '0')
  const dd = String(dia).padStart(2, '0')
  return `${ano}-${mm}-${dd}`
}

export function partes(data: ISODate): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { ano, mes, dia }
}

/** Numero de dias desde 1970-01-01, calculado sem `Date`. */
export function paraDiaSerial(data: ISODate): number {
  const { ano, mes, dia } = partes(data)
  const a = Math.floor((14 - mes) / 12)
  const y = ano + 4800 - a
  const m = mes + 12 * a - 3
  const jdn =
    dia +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  return jdn - 2440588
}

export function deDiaSerial(serial: number): ISODate {
  const jdn = serial + 2440588
  let a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor((146097 * b) / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor((1461 * d) / 4)
  const m = Math.floor((5 * e + 2) / 153)
  const dia = e - Math.floor((153 * m + 2) / 5) + 1
  const mes = m + 3 - 12 * Math.floor(m / 10)
  const ano = 100 * b + d - 4800 + Math.floor(m / 10)
  a = 0
  return criarData(ano, mes, dia)
}

export function somarDias(data: ISODate, dias: number): ISODate {
  return deDiaSerial(paraDiaSerial(data) + dias)
}

export function somarMeses(data: ISODate, meses: number): ISODate {
  const { ano, mes, dia } = partes(data)
  const total = ano * 12 + (mes - 1) + meses
  const novoAno = Math.floor(total / 12)
  const novoMes = (total % 12) + 1
  const novoDia = Math.min(dia, diasNoMes(novoAno, novoMes))
  return criarData(novoAno, novoMes, novoDia)
}

export function diferencaDias(de: ISODate, ate: ISODate): number {
  return paraDiaSerial(ate) - paraDiaSerial(de)
}

export function compararDatas(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 0 = domingo ... 6 = sabado. */
export function diaDaSemana(data: ISODate): number {
  return ((paraDiaSerial(data) + 4) % 7 + 7) % 7
}

const NOMES_DIA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
const NOMES_DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
const NOMES_DIA_EXIBICAO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const NOMES_DIA_EXIBICAO_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function nomeDiaSemana(data: ISODate): string {
  return NOMES_DIA[diaDaSemana(data)]
}

export function nomeDiaSemanaCurto(data: ISODate): string {
  return NOMES_DIA_CURTO[diaDaSemana(data)]
}

export function rotuloDiaSemana(data: ISODate): string {
  return NOMES_DIA_EXIBICAO[diaDaSemana(data)]
}

export function rotuloDiaSemanaCurto(data: ISODate): string {
  return NOMES_DIA_EXIBICAO_CURTO[diaDaSemana(data)]
}

export function ehDomingo(data: ISODate): boolean {
  return diaDaSemana(data) === 0
}

/** DD/MM/AAAA */
export function formatarData(data: ISODate | null | undefined): string {
  if (!data) return '—'
  const { ano, mes, dia } = partes(data)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
}

/** DD/MM */
export function formatarDataCurta(data: ISODate): string {
  const { mes, dia } = partes(data)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function formatarDataExtenso(data: ISODate): string {
  const { ano, mes, dia } = partes(data)
  return `${dia} de ${MESES[mes - 1]} de ${ano}`
}

export function nomeMes(mes: number): string {
  return MESES[mes - 1]
}

/** Converte o input `<input type="date">` (ja em AAAA-MM-DD) validando o formato. */
export function normalizarEntradaData(valor: string): ISODate | null {
  return isISODate(valor) ? valor : null
}

/**
 * Carimbo de digitacao. Diferente da data civil de pagamento: registra o
 * instante real em que o lancamento foi feito, com o deslocamento de
 * America/Bahia explicito.
 */
export function agoraISO(): ISODateTime {
  return new Date().toISOString()
}

export function formatarDataHora(valor: ISODateTime | null | undefined): string {
  if (!valor) return '—'
  const t = Date.parse(valor)
  if (Number.isNaN(t)) return '—'
  const local = new Date(t + OFFSET_BAHIA_MINUTOS * 60_000)
  const dd = String(local.getUTCDate()).padStart(2, '0')
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0')
  const aaaa = local.getUTCFullYear()
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mi = String(local.getUTCMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${aaaa} às ${hh}:${mi}`
}

/** Data civil de hoje em America/Bahia, usada so como palpite inicial da demo. */
export function hojeEmBahia(): ISODate {
  const local = new Date(Date.now() + OFFSET_BAHIA_MINUTOS * 60_000)
  return criarData(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate())
}
