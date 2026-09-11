import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { agoraISO, type ISODate } from '../domain/dates'
import { acrescimoPorAtraso, montarQuitacao, pagamentoDaParcela } from '../domain/cobranca'
import { gerarParcelas } from '../domain/contratos'
import { calcularJuros } from '../domain/dinheiro'
import type {
  Cliente,
  Contrato,
  EstadoOperacao,
  Evento,
  Frequencia,
  Operacao,
  Pagamento,
  PerfilUsuario,
  Usuario,
} from '../domain/tipos'
import {
  carregarOperacao,
  carregarSessao,
  restaurarOperacao,
  restaurarTudo,
  salvarOperacao,
  salvarSessao,
  type SessaoDemo,
} from '../data/armazenamento'
import { DATA_DEMO_INICIAL, OPERACOES, USUARIOS } from '../data/seed'

export interface NovoClienteEntrada extends Omit<Cliente, 'id' | 'operacaoId' | 'criadoEm'> {}

export interface NovoContratoEntrada {
  clienteId: string
  principalCents: number
  taxaPercent: number
  frequencia: Frequencia
  qtdParcelas: number
  primeiroVencimento: ISODate
  observacao?: string
}

export interface RegistroPagamentoEntrada {
  contratoId: string
  parcelaIds: string[]
  dataPagamento: ISODate
  tipo: 'parcela' | 'quitacao'
}

interface AppContextValor {
  operacoes: Operacao[]
  operacao: Operacao
  usuarios: Usuario[]
  usuario: Usuario
  perfil: PerfilUsuario
  ehProprietario: boolean
  dataReferencia: ISODate
  estado: EstadoOperacao
  sessao: SessaoDemo
  trocarOperacao: (operacaoId: string) => void
  trocarUsuario: (usuarioId: string) => void
  definirDataReferencia: (data: ISODate) => void
  criarCliente: (entrada: NovoClienteEntrada) => Cliente
  atualizarCliente: (id: string, entrada: NovoClienteEntrada) => void
  criarContrato: (entrada: NovoContratoEntrada) => Contrato
  registrarPagamento: (entrada: RegistroPagamentoEntrada) => Pagamento | null
  estornarPagamento: (pagamentoId: string, motivo: string) => void
  definirFeriadosAtivos: (ids: string[]) => void
  restaurarDemonstracao: (escopo: 'operacao' | 'tudo') => void
}

const Ctx = createContext<AppContextValor | null>(null)

function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoDemo>(() => carregarSessao())
  const [estado, setEstado] = useState<EstadoOperacao>(() => carregarOperacao(carregarSessao().operacaoId))
  const operacaoCarregada = useRef(sessao.operacaoId)

  useEffect(() => {
    if (operacaoCarregada.current !== sessao.operacaoId) {
      operacaoCarregada.current = sessao.operacaoId
      setEstado(carregarOperacao(sessao.operacaoId))
    }
    salvarSessao(sessao)
  }, [sessao])

  const aplicar = useCallback(
    (atualizador: (anterior: EstadoOperacao) => EstadoOperacao) => {
      setEstado((anterior) => {
        const proximo = atualizador(anterior)
        salvarOperacao(operacaoCarregada.current, proximo)
        return proximo
      })
    },
    [],
  )

  const operacao = useMemo(
    () => OPERACOES.find((o) => o.id === sessao.operacaoId) ?? OPERACOES[0],
    [sessao.operacaoId],
  )
  const usuariosDaOperacao = useMemo(
    () => USUARIOS.filter((u) => u.operacaoId === operacao.id),
    [operacao.id],
  )
  const usuario = useMemo(
    () => usuariosDaOperacao.find((u) => u.id === sessao.usuarioId) ?? usuariosDaOperacao[0],
    [usuariosDaOperacao, sessao.usuarioId],
  )

  const trocarOperacao = useCallback((operacaoId: string) => {
    setSessao((s) => {
      const candidatos = USUARIOS.filter((u) => u.operacaoId === operacaoId)
      const atual = USUARIOS.find((u) => u.id === s.usuarioId)
      const mesmoPerfil = candidatos.find((u) => u.perfil === atual?.perfil) ?? candidatos[0]
      return { ...s, operacaoId, usuarioId: mesmoPerfil.id }
    })
  }, [])

  const trocarUsuario = useCallback((usuarioId: string) => {
    setSessao((s) => ({ ...s, usuarioId }))
  }, [])

  const definirDataReferencia = useCallback((data: ISODate) => {
    setSessao((s) => ({ ...s, dataReferencia: data }))
  }, [])

  const registrarEvento = (
    estadoAtual: EstadoOperacao,
    evento: Omit<Evento, 'id' | 'operacaoId' | 'em' | 'por'>,
    por: string,
    operacaoId: string,
  ): Evento[] => [
    ...estadoAtual.eventos,
    { ...evento, id: novoId('ev'), operacaoId, em: agoraISO(), por },
  ]

  const criarCliente = useCallback(
    (entrada: NovoClienteEntrada): Cliente => {
      const cliente: Cliente = {
        ...entrada,
        id: novoId('cli'),
        operacaoId: operacao.id,
        criadoEm: agoraISO(),
      }
      aplicar((anterior) => ({
        ...anterior,
        clientes: [...anterior.clientes, cliente],
        eventos: registrarEvento(
          anterior,
          { tipo: 'cliente_criado', clienteId: cliente.id, descricao: `Cliente ${cliente.nome} cadastrado.` },
          usuario.id,
          operacao.id,
        ),
      }))
      return cliente
    },
    [aplicar, operacao.id, usuario.id],
  )

  const atualizarCliente = useCallback(
    (id: string, entrada: NovoClienteEntrada) => {
      aplicar((anterior) => ({
        ...anterior,
        clientes: anterior.clientes.map((c) => (c.id === id ? { ...c, ...entrada } : c)),
        eventos: registrarEvento(
          anterior,
          { tipo: 'cliente_editado', clienteId: id, descricao: `Dados de ${entrada.nome} atualizados.` },
          usuario.id,
          operacao.id,
        ),
      }))
    },
    [aplicar, operacao.id, usuario.id],
  )

  const criarContrato = useCallback(
    (entrada: NovoContratoEntrada): Contrato => {
      const jurosCents = calcularJuros(entrada.principalCents, entrada.taxaPercent)
      const id = novoId('ctr')
      let criado: Contrato | null = null

      aplicar((anterior) => {
        const contrato: Contrato = {
          id,
          operacaoId: operacao.id,
          clienteId: entrada.clienteId,
          numero: anterior.proximoNumeroContrato,
          principalCents: entrada.principalCents,
          taxaPercent: entrada.taxaPercent,
          jurosCents,
          totalCents: entrada.principalCents + jurosCents,
          frequencia: entrada.frequencia,
          qtdParcelas: entrada.qtdParcelas,
          primeiroVencimento: entrada.primeiroVencimento,
          dataContrato: sessao.dataReferencia,
          observacao: entrada.observacao,
          criadoEm: agoraISO(),
          criadoPor: usuario.id,
        }
        criado = contrato
        const parcelas = gerarParcelas(contrato, anterior.config.feriadosAtivos, (i) => `${id}-p-${i + 1}`)
        return {
          ...anterior,
          contratos: [...anterior.contratos, contrato],
          parcelas: [...anterior.parcelas, ...parcelas],
          proximoNumeroContrato: anterior.proximoNumeroContrato + 1,
          eventos: registrarEvento(
            anterior,
            {
              tipo: 'contrato_criado',
              contratoId: contrato.id,
              clienteId: contrato.clienteId,
              descricao: `Contrato ${contrato.numero} criado com ${contrato.qtdParcelas} parcelas.`,
            },
            usuario.id,
            operacao.id,
          ),
        }
      })

      return criado as unknown as Contrato
    },
    [aplicar, operacao.id, sessao.dataReferencia, usuario.id],
  )

  const registrarPagamento = useCallback(
    (entrada: RegistroPagamentoEntrada): Pagamento | null => {
      let resultado: Pagamento | null = null

      aplicar((anterior) => {
        const contrato = anterior.contratos.find((c) => c.id === entrada.contratoId)
        if (!contrato) return anterior

        const alvo = anterior.parcelas.filter((p) => entrada.parcelaIds.includes(p.id))
        // Bloqueio de duplicidade: parcela ja quitada nunca e paga de novo.
        const disponiveis = alvo.filter((p) => !pagamentoDaParcela(p.id, anterior.pagamentos))
        if (disponiveis.length === 0) return anterior

        const itens = disponiveis.map((p) => ({
          parcelaId: p.id,
          valorOriginalCents: p.valorCents,
          acrescimoCents: acrescimoPorAtraso(p, contrato, entrada.dataPagamento),
        }))
        const valorOriginalCents = itens.reduce((s, i) => s + i.valorOriginalCents, 0)
        const acrescimoCents = itens.reduce((s, i) => s + i.acrescimoCents, 0)

        const pagamento: Pagamento = {
          id: novoId('pag'),
          operacaoId: operacao.id,
          contratoId: contrato.id,
          parcelaIds: disponiveis.map((p) => p.id),
          itens,
          dataPagamento: entrada.dataPagamento,
          registradoEm: agoraISO(),
          registradoPor: usuario.id,
          valorOriginalCents,
          acrescimoCents,
          valorTotalCents: valorOriginalCents + acrescimoCents,
          meio: 'pix',
          tipo: entrada.tipo,
        }
        resultado = pagamento

        return {
          ...anterior,
          pagamentos: [...anterior.pagamentos, pagamento],
          eventos: registrarEvento(
            anterior,
            {
              tipo: entrada.tipo === 'quitacao' ? 'quitacao_registrada' : 'pagamento_registrado',
              contratoId: contrato.id,
              clienteId: contrato.clienteId,
              pagamentoId: pagamento.id,
              descricao:
                entrada.tipo === 'quitacao'
                  ? `Quitação antecipada de ${disponiveis.length} parcela(s) por Pix.`
                  : `Parcela ${disponiveis.map((p) => p.numero).join(', ')} recebida por Pix.`,
            },
            usuario.id,
            operacao.id,
          ),
        }
      })

      return resultado
    },
    [aplicar, operacao.id, usuario.id],
  )

  const estornarPagamento = useCallback(
    (pagamentoId: string, motivo: string) => {
      aplicar((anterior) => {
        const pagamento = anterior.pagamentos.find((p) => p.id === pagamentoId)
        if (!pagamento || pagamento.estorno) return anterior
        return {
          ...anterior,
          // O registro original e preservado; a reversao e anotada nele.
          pagamentos: anterior.pagamentos.map((p) =>
            p.id === pagamentoId ? { ...p, estorno: { em: agoraISO(), por: usuario.id, motivo } } : p,
          ),
          eventos: registrarEvento(
            anterior,
            {
              tipo: 'pagamento_estornado',
              contratoId: pagamento.contratoId,
              pagamentoId,
              descricao: `Pagamento desfeito. Motivo: ${motivo}`,
            },
            usuario.id,
            operacao.id,
          ),
        }
      })
    },
    [aplicar, operacao.id, usuario.id],
  )

  const definirFeriadosAtivos = useCallback(
    (ids: string[]) => {
      aplicar((anterior) => ({ ...anterior, config: { ...anterior.config, feriadosAtivos: ids } }))
    },
    [aplicar],
  )

  const restaurarDemonstracao = useCallback((escopo: 'operacao' | 'tudo') => {
    if (escopo === 'tudo') {
      restaurarTudo(OPERACOES.map((o) => o.id))
      const nova: SessaoDemo = {
        operacaoId: 'op-a',
        usuarioId: 'u-a-prop',
        dataReferencia: DATA_DEMO_INICIAL,
      }
      operacaoCarregada.current = nova.operacaoId
      setSessao(nova)
      setEstado(carregarOperacao(nova.operacaoId))
      return
    }
    setEstado(restaurarOperacao(operacaoCarregada.current))
  }, [])

  const valor: AppContextValor = {
    operacoes: OPERACOES,
    operacao,
    usuarios: usuariosDaOperacao,
    usuario,
    perfil: usuario.perfil,
    ehProprietario: usuario.perfil === 'proprietario',
    dataReferencia: sessao.dataReferencia,
    estado,
    sessao,
    trocarOperacao,
    trocarUsuario,
    definirDataReferencia,
    criarCliente,
    atualizarCliente,
    criarContrato,
    registrarPagamento,
    estornarPagamento,
    definirFeriadosAtivos,
    restaurarDemonstracao,
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useApp(): AppContextValor {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp precisa estar dentro de AppProvider')
  return ctx
}

export { montarQuitacao }
