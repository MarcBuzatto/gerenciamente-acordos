import { criarData, somarDias, type ISODate } from './dates'

/**
 * Calendario de feriados aplicaveis a Feira de Santana - BA.
 *
 * Cada entrada carrega a procedencia. Nada aqui foi inventado: datas sem base
 * legal localizada ficam marcadas como `a_confirmar` e algumas ja vem
 * desligadas, esperando confirmacao do cliente antes da producao.
 *
 * COBERTURA INCOMPLETA (pendencia registrada):
 * - As leis municipais foram levantadas em fonte secundaria (imprensa local),
 *   nao no texto oficial publicado. Confirmar antes da producao.
 * - Feriados municipais eventuais decretados ano a ano nao estao cobertos.
 * - Pontos facultativos (Carnaval, Quarta-feira de Cinzas) nao sao feriados
 *   legais; entram desligados para o cliente decidir.
 */

export type EsferaFeriado = 'nacional' | 'estadual' | 'municipal' | 'facultativo'
export type ProcedenciaFeriado = 'confirmado' | 'a_confirmar'

export interface RegraFeriado {
  id: string
  nome: string
  esfera: EsferaFeriado
  procedencia: ProcedenciaFeriado
  fonte: string
  /** Data fixa `MM-DD` ou deslocamento em dias a partir do Domingo de Pascoa. */
  tipo: 'fixo' | 'movel'
  mesDia?: string
  offsetPascoa?: number
  /** Entradas ligadas removem o dia do calendario de vencimentos. */
  ativoPorPadrao: boolean
}

export const REGRAS_FERIADO: RegraFeriado[] = [
  {
    id: 'confraternizacao',
    nome: 'Confraternização Universal',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 662/1949, art. 1º',
    tipo: 'fixo',
    mesDia: '01-01',
    ativoPorPadrao: true,
  },
  {
    id: 'sexta-santa',
    nome: 'Sexta-feira da Paixão',
    esfera: 'municipal',
    procedencia: 'a_confirmar',
    fonte: 'Lei municipal 764/1974 (Feira de Santana), c/c Lei federal 9.093/1995, art. 2º — fonte secundária',
    tipo: 'movel',
    offsetPascoa: -2,
    ativoPorPadrao: true,
  },
  {
    id: 'tiradentes',
    nome: 'Tiradentes',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 662/1949, art. 1º',
    tipo: 'fixo',
    mesDia: '04-21',
    ativoPorPadrao: true,
  },
  {
    id: 'trabalho',
    nome: 'Dia do Trabalho',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 662/1949, art. 1º',
    tipo: 'fixo',
    mesDia: '05-01',
    ativoPorPadrao: true,
  },
  {
    id: 'corpus-christi',
    nome: 'Corpus Christi',
    esfera: 'municipal',
    procedencia: 'a_confirmar',
    fonte: 'Lei municipal 764/1974 (Feira de Santana) — fonte secundária',
    tipo: 'movel',
    offsetPascoa: 60,
    ativoPorPadrao: true,
  },
  {
    id: 'sao-joao',
    nome: 'São João',
    esfera: 'municipal',
    procedencia: 'a_confirmar',
    fonte: 'Lei municipal 764/1974 (Feira de Santana) — fonte secundária',
    tipo: 'fixo',
    mesDia: '06-24',
    ativoPorPadrao: true,
  },
  {
    id: 'independencia-bahia',
    nome: 'Independência da Bahia',
    esfera: 'estadual',
    procedencia: 'confirmado',
    fonte: 'Feriado civil do Estado da Bahia (2 de Julho)',
    tipo: 'fixo',
    mesDia: '07-02',
    ativoPorPadrao: true,
  },
  {
    id: 'santana',
    nome: "Senhora Sant'Ana (padroeira)",
    esfera: 'municipal',
    procedencia: 'a_confirmar',
    fonte: 'Lei municipal 851/1978 (Feira de Santana) — fonte secundária',
    tipo: 'fixo',
    mesDia: '07-26',
    ativoPorPadrao: true,
  },
  {
    id: 'independencia',
    nome: 'Independência do Brasil',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 662/1949, art. 1º',
    tipo: 'fixo',
    mesDia: '09-07',
    ativoPorPadrao: true,
  },
  {
    id: 'aparecida',
    nome: 'Nossa Senhora Aparecida',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 6.802/1980',
    tipo: 'fixo',
    mesDia: '10-12',
    ativoPorPadrao: true,
  },
  {
    id: 'finados',
    nome: 'Finados',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 662/1949, art. 1º',
    tipo: 'fixo',
    mesDia: '11-02',
    ativoPorPadrao: true,
  },
  {
    id: 'republica',
    nome: 'Proclamação da República',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 662/1949, art. 1º',
    tipo: 'fixo',
    mesDia: '11-15',
    ativoPorPadrao: true,
  },
  {
    id: 'consciencia-negra',
    nome: 'Dia Nacional de Zumbi e da Consciência Negra',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 14.759/2023',
    tipo: 'fixo',
    mesDia: '11-20',
    ativoPorPadrao: true,
  },
  {
    id: 'natal',
    nome: 'Natal',
    esfera: 'nacional',
    procedencia: 'confirmado',
    fonte: 'Lei federal 662/1949, art. 1º',
    tipo: 'fixo',
    mesDia: '12-25',
    ativoPorPadrao: true,
  },
  {
    id: 'carnaval',
    nome: 'Carnaval (terça-feira)',
    esfera: 'facultativo',
    procedencia: 'a_confirmar',
    fonte: 'Ponto facultativo federal — não é feriado legal. Confirmar prática do cliente.',
    tipo: 'movel',
    offsetPascoa: -47,
    ativoPorPadrao: false,
  },
  {
    id: 'cinzas',
    nome: 'Quarta-feira de Cinzas',
    esfera: 'facultativo',
    procedencia: 'a_confirmar',
    fonte: 'Ponto facultativo federal (até as 14h) — não é feriado legal. Confirmar prática do cliente.',
    tipo: 'movel',
    offsetPascoa: -46,
    ativoPorPadrao: false,
  },
]

export const IDS_FERIADO_PADRAO: string[] = REGRAS_FERIADO.filter((r) => r.ativoPorPadrao).map(
  (r) => r.id,
)

/** Domingo de Pascoa pelo algoritmo de Meeus/Butcher (calendario gregoriano). */
export function domingoDePascoa(ano: number): ISODate {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return criarData(ano, mes, dia)
}

export interface FeriadoNoAno {
  data: ISODate
  regra: RegraFeriado
}

const cache = new Map<string, FeriadoNoAno[]>()

export function feriadosDoAno(ano: number, idsAtivos: string[]): FeriadoNoAno[] {
  const chave = `${ano}|${[...idsAtivos].sort().join(',')}`
  const emCache = cache.get(chave)
  if (emCache) return emCache

  const pascoa = domingoDePascoa(ano)
  const ativos = new Set(idsAtivos)
  const lista: FeriadoNoAno[] = []

  for (const regra of REGRAS_FERIADO) {
    if (!ativos.has(regra.id)) continue
    if (regra.tipo === 'fixo' && regra.mesDia) {
      lista.push({ data: `${ano}-${regra.mesDia}`, regra })
    } else if (regra.tipo === 'movel' && regra.offsetPascoa !== undefined) {
      lista.push({ data: somarDias(pascoa, regra.offsetPascoa), regra })
    }
  }

  lista.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
  cache.set(chave, lista)
  return lista
}

/** Consulta rapida: devolve o feriado que cai na data, se houver. */
export function feriadoEm(data: ISODate, idsAtivos: string[]): FeriadoNoAno | null {
  const ano = Number(data.slice(0, 4))
  return feriadosDoAno(ano, idsAtivos).find((f) => f.data === data) ?? null
}
