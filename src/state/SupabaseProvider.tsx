import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../data/api'
import { FalhaApi, classificar, novaChave } from '../data/api'
import type { ISODate } from '../domain/dates'
import type { EstadoOperacao } from '../domain/tipos'
import { useAuth } from './AuthContext'
import {
  ESTADO_VAZIO,
  LojaCtx,
  type DadosCliente,
  type EntradaContrato,
  type Loja,
  type UsuarioAtual,
} from './loja'

/**
 * Provedor integrado ao Supabase.
 *
 * Carrega o estado da operação a partir do banco, com as permissões do usuário
 * valendo. Toda escrita passa pela API e, só depois da confirmação do servidor,
 * o estado local é recarregado — nunca se mostra sucesso antes disso.
 */
export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { vinculo, usuario } = useAuth()
  const [estado, setEstado] = useState<EstadoOperacao>(ESTADO_VAZIO)
  const [dataReferencia, setDataReferencia] = useState<ISODate>('')
  const [membros, setMembros] = useState<UsuarioAtual[]>([])
  const [carregando, setCarregando] = useState(true)
  const [falha, setFalha] = useState<FalhaApi | null>(null)
  const emAndamento = useRef(false)

  const operacaoId = vinculo?.operacaoId ?? ''
  const ehProprietario = vinculo?.papel === 'proprietario'

  const recarregar = useCallback(async () => {
    if (!operacaoId) return
    setFalha(null)
    try {
      const [hoje, clientes, config, equipe] = await Promise.all([
        api.hojeNaOperacao(operacaoId),
        api.listarClientes(operacaoId),
        api.carregarConfiguracao(operacaoId).catch(() => ({ feriadosAtivos: [] })),
        api.listarMembros(operacaoId).catch(() => []),
      ])
      setDataReferencia(hoje)
      setMembros(
        equipe.map((m) => ({ id: m.usuarioId, nome: m.nome, perfil: m.papel })),
      )

      if (!ehProprietario) {
        // O assistente não lê contratos, parcelas nem pagamentos. Ele trabalha
        // pela lista de vencimentos, que é uma projeção autorizada.
        setEstado({ ...ESTADO_VAZIO, clientes, config })
        return
      }

      const [contratos, parcelas, pagamentos] = await Promise.all([
        api.listarContratos(operacaoId),
        api.listarParcelas(operacaoId),
        api.listarPagamentos(operacaoId),
      ])
      setEstado({
        clientes,
        contratos,
        parcelas,
        pagamentos,
        eventos: [],
        config,
        proximoNumeroContrato: contratos.reduce((m, c) => Math.max(m, c.numero), 0) + 1,
      })
    } catch (erro) {
      setFalha(classificar(erro))
    } finally {
      setCarregando(false)
    }
  }, [operacaoId, ehProprietario])

  useEffect(() => {
    setCarregando(true)
    void recarregar()
  }, [recarregar])

  /** Executa a escrita e só recarrega depois do servidor confirmar. */
  const escrever = useCallback(
    async <T,>(acao: () => Promise<T>): Promise<T> => {
      // Trava de reentrância: protege contra duplo toque enquanto a requisição
      // está no ar. A garantia de verdade contra duplicidade está no banco.
      if (emAndamento.current) {
        throw new FalhaApi('conflito', 'Já existe um lançamento em andamento.')
      }
      emAndamento.current = true
      try {
        const resultado = await acao()
        await recarregar()
        return resultado
      } catch (erro) {
        throw classificar(erro)
      } finally {
        emAndamento.current = false
      }
    },
    [recarregar],
  )

  const valor = useMemo<Loja>(() => {
    return {
      carregando,
      falha,
      recarregar,
      operacao: {
        id: operacaoId,
        nome: vinculo?.operacaoNome ?? '',
        cidade: vinculo?.cidade ?? '',
        fuso: vinculo?.fuso ?? 'America/Bahia',
      },
      usuario: {
        id: usuario?.id ?? '',
        nome:
          (usuario?.user_metadata?.nome as string) ??
          usuario?.email?.split('@')[0] ??
          'Usuário',
        perfil: vinculo?.papel ?? 'assistente',
      },
      ehProprietario,
      dataReferencia,
      estado,

      membros,
      buscarVencimentos: (filtro, busca) => api.listarVencimentos(operacaoId, filtro, busca),
      buscarIndicadores: () => api.carregarIndicadores(operacaoId),

      criarCliente: (entrada: DadosCliente) =>
        escrever(() => api.criarCliente(operacaoId, usuario?.id ?? '', entrada)),

      atualizarCliente: (id: string, entrada: DadosCliente) =>
        escrever(async () => {
          await api.atualizarCliente(id, usuario?.id ?? '', entrada)
        }),

      criarContrato: (entrada: EntradaContrato) =>
        escrever(() =>
          api.criarContrato({
            operacaoId,
            clienteId: entrada.clienteId,
            principalCents: entrada.principalCents,
            taxaPercent: entrada.taxaPercent,
            frequencia: entrada.frequencia,
            qtdParcelas: entrada.qtdParcelas,
            primeiroVencimento: entrada.primeiroVencimento,
            observacao: entrada.observacao,
            chave: novaChave('contrato'),
          }),
        ),

      registrarPagamento: (entrada) =>
        escrever(async () => {
          await api.registrarPagamento({
            operacaoId,
            parcelaId: entrada.parcelaId,
            dataPagamento: entrada.dataPagamento,
            chave: novaChave('pagamento'),
          })
        }),

      quitarContrato: (contratoId, dataPagamento) =>
        escrever(async () => {
          await api.quitarContrato({
            operacaoId,
            contratoId,
            dataPagamento,
            chave: novaChave('quitacao'),
          })
        }),

      estornarPagamento: (pagamentoId, motivo) =>
        escrever(async () => {
          await api.reverterPagamento({ operacaoId, pagamentoId, motivo })
        }),

      definirFeriadosAtivos: (ids) =>
        escrever(async () => {
          await api.salvarFeriados(operacaoId, ids)
        }),

      valorDevidoEm: (parcelaId, data) => api.valorDevidoEm(operacaoId, parcelaId, data),
    }
  }, [
    carregando, falha, recarregar, operacaoId, vinculo, usuario, ehProprietario,
    dataReferencia, estado, membros, escrever,
  ])

  return <LojaCtx.Provider value={valor}>{children}</LojaCtx.Provider>
}
