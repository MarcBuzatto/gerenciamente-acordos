import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { agoraISO, compararDatas, type ISODate } from '../domain/dates'
import { acrescimoPorAtraso, montarQuitacao, pagamentoDaParcela } from '../domain/cobranca'
import { gerarParcelas } from '../domain/contratos'
import { calcularJuros } from '../domain/dinheiro'
import {
  avaliarTodasParcelas,
  calcularIndicadoresCarteira,
  calcularIndicadoresDia,
} from '../domain/indicadores'
import type { Cliente, Contrato, EstadoOperacao, Evento, Pagamento } from '../domain/tipos'
import type { FiltroVencimento, LinhaVencimento } from '../data/api'
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
import { LojaCtx, type DadosCliente, type EntradaContrato, type Loja } from './loja'

/**
 * Provedor da DEMONSTRAÇÃO.
 *
 * Mantém o protótipo funcionando com dados fictícios no navegador, incluindo o
 * painel que alterna perfil, operação e data de referência. Serve para
 * demonstrar fluxos e testar usabilidade — nunca para dinheiro real.
 *
 * Só é montado quando a aplicação roda em modo demonstração (`VITE_MODO=demo`).
 */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoDemo>(() => carregarSessao())
  const [estado, setEstado] = useState<EstadoOperacao>(() =>
    carregarOperacao(carregarSessao().operacaoId),
  )
  const operacaoCarregada = useRef(sessao.operacaoId)

  useEffect(() => {
    if (operacaoCarregada.current !== sessao.operacaoId) {
      operacaoCarregada.current = sessao.operacaoId
      setEstado(carregarOperacao(sessao.operacaoId))
    }
    salvarSessao(sessao)
  }, [sessao])

  const aplicar = useCallback((atualizador: (anterior: EstadoOperacao) => EstadoOperacao) => {
    setEstado((anterior) => {
      const proximo = atualizador(anterior)
      salvarOperacao(operacaoCarregada.current, proximo)
      return proximo
    })
  }, [])

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

  const novoId = (prefixo: string) =>
    `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const comEvento = (
    anterior: EstadoOperacao,
    evento: Omit<Evento, 'id' | 'operacaoId' | 'em' | 'por'>,
  ): Evento[] => [
    ...anterior.eventos,
    { ...evento, id: novoId('ev'), operacaoId: operacao.id, em: agoraISO(), por: usuario.id },
  ]

  const valor = useMemo<Loja>(() => {
    const criarCliente = async (entrada: DadosCliente): Promise<Cliente> => {
      const cliente: Cliente = {
        ...entrada,
        id: novoId('cli'),
        operacaoId: operacao.id,
        criadoEm: agoraISO(),
      }
      aplicar((anterior) => ({
        ...anterior,
        clientes: [...anterior.clientes, cliente],
        eventos: comEvento(anterior, {
          tipo: 'cliente_criado',
          clienteId: cliente.id,
          descricao: `Cliente ${cliente.nome} cadastrado.`,
        }),
      }))
      return cliente
    }

    const criarContrato = async (entrada: EntradaContrato): Promise<string> => {
      const jurosCents = calcularJuros(entrada.principalCents, entrada.taxaPercent)
      const id = novoId('ctr')
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
        const parcelas = gerarParcelas(
          contrato,
          anterior.config.feriadosAtivos,
          (i) => `${id}-p-${i + 1}`,
        )
        return {
          ...anterior,
          contratos: [...anterior.contratos, contrato],
          parcelas: [...anterior.parcelas, ...parcelas],
          proximoNumeroContrato: anterior.proximoNumeroContrato + 1,
          eventos: comEvento(anterior, {
            tipo: 'contrato_criado',
            contratoId: id,
            clienteId: entrada.clienteId,
            descricao: `Contrato ${contrato.numero} criado com ${contrato.qtdParcelas} parcelas.`,
          }),
        }
      })
      return id
    }

    const lancar = async (
      contratoId: string,
      parcelaIds: string[],
      dataPagamento: ISODate,
      tipo: 'parcela' | 'quitacao',
    ): Promise<void> => {
      aplicar((anterior) => {
        const contrato = anterior.contratos.find((c) => c.id === contratoId)
        if (!contrato) return anterior
        const alvo = anterior.parcelas.filter((p) => parcelaIds.includes(p.id))
        const disponiveis = alvo.filter((p) => !pagamentoDaParcela(p.id, anterior.pagamentos))
        if (disponiveis.length === 0) return anterior

        const itens = disponiveis.map((p) => ({
          parcelaId: p.id,
          valorOriginalCents: p.valorCents,
          acrescimoCents: acrescimoPorAtraso(p, contrato, dataPagamento),
        }))
        const valorOriginalCents = itens.reduce((s, i) => s + i.valorOriginalCents, 0)
        const acrescimoCents = itens.reduce((s, i) => s + i.acrescimoCents, 0)
        const pagamento: Pagamento = {
          id: novoId('pag'),
          operacaoId: operacao.id,
          contratoId,
          parcelaIds: disponiveis.map((p) => p.id),
          itens,
          dataPagamento,
          registradoEm: agoraISO(),
          registradoPor: usuario.id,
          valorOriginalCents,
          acrescimoCents,
          valorTotalCents: valorOriginalCents + acrescimoCents,
          meio: 'pix',
          tipo,
        }
        return {
          ...anterior,
          pagamentos: [...anterior.pagamentos, pagamento],
          eventos: comEvento(anterior, {
            tipo: tipo === 'quitacao' ? 'quitacao_registrada' : 'pagamento_registrado',
            contratoId,
            clienteId: contrato.clienteId,
            pagamentoId: pagamento.id,
            descricao:
              tipo === 'quitacao'
                ? `Quitação antecipada de ${disponiveis.length} parcela(s) por Pix.`
                : `Parcela ${disponiveis.map((p) => p.numero).join(', ')} recebida por Pix.`,
          }),
        }
      })
    }

    return {
      carregando: false,
      falha: null,
      recarregar: async () => undefined,
      operacao: {
        id: operacao.id,
        nome: operacao.nome,
        cidade: operacao.cidade,
        fuso: 'America/Bahia',
      },
      usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil },
      ehProprietario: usuario.perfil === 'proprietario',
      dataReferencia: sessao.dataReferencia,
      estado,

      membros: usuariosDaOperacao.map((u) => ({
        id: u.id,
        nome: u.nome,
        perfil: u.perfil,
      })),

      buscarIndicadores: async () => {
        const dia = calcularIndicadoresDia(estado, sessao.dataReferencia)
        const carteira = calcularIndicadoresCarteira(estado, sessao.dataReferencia)
        return {
          dataReferencia: dia.dataReferencia,
          recebidoHojeCents: dia.recebidoHojeCents,
          qtdRecebimentosHoje: dia.qtdRecebimentosHoje,
          pendenteHojeCents: dia.pendenteHojeCents,
          qtdPendentesHoje: dia.qtdPendentesHoje,
          totalAtrasadoCents: dia.totalAtrasadoCents,
          qtdAtrasadas: dia.qtdAtrasadas,
          principalEmAbertoCents: carteira.principalEmAbertoCents,
          jurosEmAbertoCents:
            carteira.totalAReceberCents -
            carteira.principalEmAbertoCents -
            carteira.acrescimosEmAbertoCents,
          acrescimosEmAbertoCents: carteira.acrescimosEmAbertoCents,
          totalAReceberCents: carteira.totalAReceberCents,
          contratosAbertos: carteira.contratosAbertos,
          contratosAtrasados: carteira.contratosAtrasados,
        }
      },

      buscarVencimentos: async (filtro: FiltroVencimento, busca?: string) => {
        const avaliadas = avaliarTodasParcelas(estado, sessao.dataReferencia)
        const termo = (busca ?? '').trim().toLowerCase()
        const digitos = termo.replace(/\D/g, '')
        return avaliadas
          .filter((a) => {
            if (filtro === 'todos') return true
            if (filtro === 'hoje') return a.situacao === 'hoje'
            if (filtro === 'atrasados') return a.situacao === 'atrasada'
            if (filtro === 'proximos') return a.situacao === 'a_vencer'
            return a.situacao === 'paga'
          })
          .filter((a) => {
            if (!termo) return true
            return (
              a.cliente.nome.toLowerCase().includes(termo) ||
              (digitos.length > 0 && a.cliente.telefone.replace(/\D/g, '').includes(digitos)) ||
              String(a.contrato.numero) === termo
            )
          })
          .sort((a, b) =>
            filtro === 'pagos'
              ? compararDatas(
                  b.pagamento?.dataPagamento ?? '',
                  a.pagamento?.dataPagamento ?? '',
                )
              : compararDatas(a.parcela.vencimento, b.parcela.vencimento) ||
                a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'),
          )
          .map<LinhaVencimento>((a) => ({
            parcelaId: a.parcela.id,
            contratoId: a.contrato.id,
            clienteId: a.cliente.id,
            clienteNome: a.cliente.nome,
            clienteTelefone: a.cliente.telefone,
            contratoNumero: a.contrato.numero,
            parcelaNumero: a.parcela.numero,
            qtdParcelas: a.contrato.qtdParcelas,
            vencimento: a.parcela.vencimento,
            dataContrato: a.contrato.dataContrato,
            situacao: a.situacao,
            valorOriginalCents: a.valorOriginalCents,
            acrescimoCents: a.acrescimoCents,
            totalDevidoCents: a.totalDevidoCents,
            diasDeAtraso: a.diasDeAtraso,
            dataPagamento: a.pagamento?.dataPagamento ?? null,
          }))
      },

      criarCliente,
      atualizarCliente: async (id, entrada) => {
        aplicar((anterior) => ({
          ...anterior,
          clientes: anterior.clientes.map((c) => (c.id === id ? { ...c, ...entrada } : c)),
          eventos: comEvento(anterior, {
            tipo: 'cliente_editado',
            clienteId: id,
            descricao: `Dados de ${entrada.nome} atualizados.`,
          }),
        }))
      },
      criarContrato,
      registrarPagamento: async ({ contratoId, parcelaId, dataPagamento }) =>
        lancar(contratoId, [parcelaId], dataPagamento, 'parcela'),
      quitarContrato: async (contratoId, dataPagamento) => {
        const contrato = estado.contratos.find((c) => c.id === contratoId)
        const cliente = estado.clientes.find((c) => c.id === contrato?.clienteId)
        if (!contrato || !cliente) return
        const parcelas = estado.parcelas.filter((p) => p.contratoId === contratoId)
        const quitacao = montarQuitacao(
          parcelas,
          contrato,
          cliente,
          estado.pagamentos,
          dataPagamento,
        )
        await lancar(
          contratoId,
          quitacao.parcelas.map((p) => p.parcela.id),
          dataPagamento,
          'quitacao',
        )
      },
      estornarPagamento: async (pagamentoId, motivo) => {
        aplicar((anterior) => {
          const pagamento = anterior.pagamentos.find((p) => p.id === pagamentoId)
          if (!pagamento || pagamento.estorno) return anterior
          return {
            ...anterior,
            pagamentos: anterior.pagamentos.map((p) =>
              p.id === pagamentoId
                ? { ...p, estorno: { em: agoraISO(), por: usuario.id, motivo } }
                : p,
            ),
            eventos: comEvento(anterior, {
              tipo: 'pagamento_estornado',
              contratoId: pagamento.contratoId,
              pagamentoId,
              descricao: `Pagamento desfeito. Motivo: ${motivo}`,
            }),
          }
        })
      },
      definirFeriadosAtivos: async (ids) => {
        aplicar((anterior) => ({
          ...anterior,
          config: { ...anterior.config, feriadosAtivos: ids },
        }))
      },
      valorDevidoEm: async (parcelaId, data) => {
        const parcela = estado.parcelas.find((p) => p.id === parcelaId)
        const contrato = estado.contratos.find((c) => c.id === parcela?.contratoId)
        if (!parcela || !contrato) {
          return { valorOriginalCents: 0, acrescimoCents: 0, totalCents: 0 }
        }
        const acrescimo = acrescimoPorAtraso(parcela, contrato, data)
        return {
          valorOriginalCents: parcela.valorCents,
          acrescimoCents: acrescimo,
          totalCents: parcela.valorCents + acrescimo,
        }
      },

      demo: {
        operacoes: OPERACOES.map((o) => ({
          id: o.id,
          nome: o.nome,
          cidade: o.cidade,
          fuso: 'America/Bahia',
        })),
        usuarios: usuariosDaOperacao.map((u) => ({
          id: u.id,
          nome: u.nome,
          perfil: u.perfil,
        })),
        trocarOperacao: (operacaoId: string) =>
          setSessao((s) => {
            const candidatos = USUARIOS.filter((u) => u.operacaoId === operacaoId)
            const atual = USUARIOS.find((u) => u.id === s.usuarioId)
            const mesmoPerfil =
              candidatos.find((u) => u.perfil === atual?.perfil) ?? candidatos[0]
            return { ...s, operacaoId, usuarioId: mesmoPerfil.id }
          }),
        trocarUsuario: (usuarioId: string) => setSessao((s) => ({ ...s, usuarioId })),
        definirDataReferencia: (data: ISODate) =>
          setSessao((s) => ({ ...s, dataReferencia: data })),
        restaurar: (escopo: 'operacao' | 'tudo') => {
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
        },
      },
    }
    // `comEvento` e `novoId` são estáveis por construção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicar, estado, operacao, sessao, usuario, usuariosDaOperacao])

  return <LojaCtx.Provider value={valor}>{children}</LojaCtx.Provider>
}
