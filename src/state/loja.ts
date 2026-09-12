import { createContext, useContext } from 'react'
import type { ISODate } from '../domain/dates'
import type { Cliente, EstadoOperacao, PerfilUsuario } from '../domain/tipos'
import type {
  FalhaApi,
  FiltroVencimento,
  IndicadoresServidor,
  LinhaVencimento,
} from '../data/api'

/**
 * Interface única que as telas consomem.
 *
 * Duas implementações a fornecem:
 *
 * - `DemoProvider` — dados fictícios no navegador, para demonstração e testes
 *   de usabilidade. Traz o painel de demonstração (perfil, operação, data).
 * - `SupabaseProvider` — dados reais, autorizados pelo banco. Sem seletor de
 *   perfil, sem troca de operação sem vínculo, sem data manipulável e sem
 *   restauração de cenário.
 *
 * Manter a mesma interface foi o que permitiu preservar as telas aprovadas.
 */

export interface OperacaoAtual {
  id: string
  nome: string
  cidade: string
  fuso: string
}

export interface UsuarioAtual {
  id: string
  nome: string
  perfil: PerfilUsuario
}

export type DadosCliente = Omit<Cliente, 'id' | 'operacaoId' | 'criadoEm'>

export interface EntradaContrato {
  clienteId: string
  principalCents: number
  taxaPercent: number
  frequencia: 'diaria' | 'semanal' | 'mensal'
  qtdParcelas: number
  primeiroVencimento: ISODate
  observacao?: string
}

export interface Loja {
  /** `true` enquanto a primeira carga não chegou. */
  carregando: boolean
  /** Falha de carga (conexão, permissão, sessão). `null` quando está tudo bem. */
  falha: FalhaApi | null
  recarregar: () => Promise<void>

  operacao: OperacaoAtual
  usuario: UsuarioAtual
  ehProprietario: boolean
  /** Data corrente da operação. No modo integrado vem do servidor. */
  dataReferencia: ISODate

  /**
   * Estado da operação para as telas de proprietário. No modo integrado com
   * perfil de assistente, vem vazio de propósito: contratos, parcelas e
   * pagamentos não são legíveis por ele, e as telas correspondentes não são
   * oferecidas.
   */
  estado: EstadoOperacao

  /** Pessoas com vínculo na operação, para resolver autoria de lançamentos. */
  membros: UsuarioAtual[]

  /** Lista de cobrança — a mesma projeção autorizada para os dois papéis. */
  buscarVencimentos: (filtro: FiltroVencimento, busca?: string) => Promise<LinhaVencimento[]>

  /** Indicadores da carteira. Recusado para o assistente, no servidor. */
  buscarIndicadores: () => Promise<IndicadoresServidor>

  criarCliente: (entrada: DadosCliente) => Promise<Cliente>
  atualizarCliente: (id: string, entrada: DadosCliente) => Promise<void>
  criarContrato: (entrada: EntradaContrato) => Promise<string>
  registrarPagamento: (entrada: {
    contratoId: string
    parcelaId: string
    dataPagamento: ISODate
  }) => Promise<void>
  quitarContrato: (contratoId: string, dataPagamento: ISODate) => Promise<void>
  estornarPagamento: (pagamentoId: string, motivo: string) => Promise<void>
  definirFeriadosAtivos: (ids: string[]) => Promise<void>
  /** Recalcula o valor devido numa data anterior (recebimento retroativo). */
  valorDevidoEm: (
    parcelaId: string,
    data: ISODate,
  ) => Promise<{ valorOriginalCents: number; acrescimoCents: number; totalCents: number }>

  /** Presente apenas no modo demonstração. */
  demo?: {
    operacoes: OperacaoAtual[]
    usuarios: UsuarioAtual[]
    trocarOperacao: (id: string) => void
    trocarUsuario: (id: string) => void
    definirDataReferencia: (data: ISODate) => void
    restaurar: (escopo: 'operacao' | 'tudo') => void
  }
}

export const LojaCtx = createContext<Loja | null>(null)

export function useApp(): Loja {
  const ctx = useContext(LojaCtx)
  if (!ctx) throw new Error('useApp precisa estar dentro de um provedor de dados')
  return ctx
}

export const ESTADO_VAZIO: EstadoOperacao = {
  clientes: [],
  contratos: [],
  parcelas: [],
  pagamentos: [],
  eventos: [],
  config: { feriadosAtivos: [] },
  proximoNumeroContrato: 1,
}
