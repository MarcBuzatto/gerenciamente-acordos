import type { EstadoOperacao } from '../domain/tipos'
import type { ISODate } from '../domain/dates'
import { criarEstadoSeed, DATA_DEMO_INICIAL } from './seed'

/**
 * Persistencia local da demonstracao.
 *
 * IMPORTANTE: isto NAO e seguranca. Os dados ficam no `localStorage` do
 * navegador, separados por identificador de operacao apenas para que a
 * demonstracao nao misture cenarios. Em producao, o isolamento tem de ser
 * feito no servidor, com autenticacao real.
 */

const VERSAO = 'v1'
const PREFIXO = `acordos.demo.${VERSAO}`

export const chaveOperacao = (operacaoId: string) => `${PREFIXO}.op.${operacaoId}`
export const CHAVE_SESSAO = `${PREFIXO}.sessao`

export interface SessaoDemo {
  operacaoId: string
  usuarioId: string
  dataReferencia: ISODate
}

export const SESSAO_PADRAO: SessaoDemo = {
  operacaoId: 'op-a',
  usuarioId: 'u-a-prop',
  dataReferencia: DATA_DEMO_INICIAL,
}

function disponivel(): boolean {
  try {
    const teste = `${PREFIXO}.teste`
    window.localStorage.setItem(teste, '1')
    window.localStorage.removeItem(teste)
    return true
  } catch {
    return false
  }
}

const memoria = new Map<string, string>()

function ler(chave: string): string | null {
  if (disponivel()) return window.localStorage.getItem(chave)
  return memoria.get(chave) ?? null
}

function escrever(chave: string, valor: string): void {
  if (disponivel()) window.localStorage.setItem(chave, valor)
  else memoria.set(chave, valor)
}

function remover(chave: string): void {
  if (disponivel()) window.localStorage.removeItem(chave)
  else memoria.delete(chave)
}

export function carregarOperacao(operacaoId: string): EstadoOperacao {
  const bruto = ler(chaveOperacao(operacaoId))
  if (bruto) {
    try {
      const estado = JSON.parse(bruto) as EstadoOperacao
      if (estado && Array.isArray(estado.clientes) && Array.isArray(estado.parcelas)) {
        return estado
      }
    } catch {
      // Cai para o seed quando o conteudo esta corrompido.
    }
  }
  const novo = criarEstadoSeed(operacaoId, DATA_DEMO_INICIAL)
  salvarOperacao(operacaoId, novo)
  return novo
}

export function salvarOperacao(operacaoId: string, estado: EstadoOperacao): void {
  escrever(chaveOperacao(operacaoId), JSON.stringify(estado))
}

export function restaurarOperacao(operacaoId: string): EstadoOperacao {
  remover(chaveOperacao(operacaoId))
  return carregarOperacao(operacaoId)
}

export function restaurarTudo(operacoesIds: string[]): void {
  for (const id of operacoesIds) remover(chaveOperacao(id))
  remover(CHAVE_SESSAO)
}

export function carregarSessao(): SessaoDemo {
  const bruto = ler(CHAVE_SESSAO)
  if (bruto) {
    try {
      const s = JSON.parse(bruto) as SessaoDemo
      if (s?.operacaoId && s?.usuarioId && s?.dataReferencia) return s
    } catch {
      // ignora
    }
  }
  return { ...SESSAO_PADRAO }
}

export function salvarSessao(sessao: SessaoDemo): void {
  escrever(CHAVE_SESSAO, JSON.stringify(sessao))
}
