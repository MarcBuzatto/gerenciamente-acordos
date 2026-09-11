import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext'
import { Cabecalho } from '../components/Layout'
import { Aviso, Campo, CampoBusca, Cartao, LinhaDado, Segmentado, Vazio } from '../components/Base'
import { IconeAdicionar, IconeCheck, IconeSeta } from '../components/Icones'
import {
  analisarMoeda,
  formatarMoeda,
  formatarPercentual,
  somar,
} from '../../domain/dinheiro'
import {
  formatarData,
  formatarDataCurta,
  normalizarEntradaData,
  rotuloDiaSemanaCurto,
  type ISODate,
} from '../../domain/dates'
import { avaliarPrimeiroVencimento, RESUMO_REGRAS_CALENDARIO } from '../../domain/calendario'
import { montarResumoContrato } from '../../domain/contratos'
import type { Frequencia } from '../../domain/tipos'

const CHAVE_RASCUNHO = 'acordos.demo.v1.rascunho-contrato'

interface Rascunho {
  passo: number
  clienteId: string
  valorTexto: string
  taxaTexto: string
  frequencia: Frequencia
  qtdTexto: string
  primeiroVencimento: ISODate
  observacao: string
}

function rascunhoInicial(dataReferencia: ISODate): Rascunho {
  return {
    passo: 0,
    clienteId: '',
    valorTexto: '',
    taxaTexto: '40',
    frequencia: 'diaria',
    qtdTexto: '20',
    primeiroVencimento: dataReferencia,
    observacao: '',
  }
}

function lerRascunho(dataReferencia: ISODate): Rascunho | null {
  try {
    const bruto = window.sessionStorage.getItem(CHAVE_RASCUNHO)
    if (!bruto) return null
    const r = JSON.parse(bruto) as Rascunho
    return { ...rascunhoInicial(dataReferencia), ...r }
  } catch {
    return null
  }
}

export function ContratoNovo() {
  const { estado, dataReferencia, criarContrato, ehProprietario } = useApp()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const clienteDaUrl = params.get('cliente')

  const [rascunho, setRascunho] = useState<Rascunho>(() => {
    const salvo = lerRascunho(dataReferencia)
    const base = salvo ?? rascunhoInicial(dataReferencia)
    // Voltando do cadastro de cliente: retoma o rascunho já no passo das condições.
    if (clienteDaUrl) return { ...base, clienteId: clienteDaUrl, passo: Math.max(base.passo, 1) }
    return base
  })
  const [buscaCliente, setBuscaCliente] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const salvando = useRef(false)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(rascunho))
    } catch {
      // Sem sessionStorage o rascunho simplesmente não persiste.
    }
  }, [rascunho])

  const cliente = estado.clientes.find((c) => c.id === rascunho.clienteId)

  const principalCents = analisarMoeda(rascunho.valorTexto) ?? 0
  const taxaPercent = Number(rascunho.taxaTexto.replace(',', '.')) || 0
  const qtdParcelas = Number(rascunho.qtdTexto) || 0

  const ajuste = useMemo(
    () => avaliarPrimeiroVencimento(rascunho.primeiroVencimento, estado.config.feriadosAtivos),
    [rascunho.primeiroVencimento, estado.config.feriadosAtivos],
  )

  const resumo = useMemo(() => {
    if (principalCents <= 0 || qtdParcelas <= 0) return null
    return montarResumoContrato({
      principalCents,
      taxaPercent,
      frequencia: rascunho.frequencia,
      qtdParcelas,
      primeiroVencimento: rascunho.primeiroVencimento,
      feriadosAtivos: estado.config.feriadosAtivos,
    })
  }, [
    principalCents,
    taxaPercent,
    qtdParcelas,
    rascunho.frequencia,
    rascunho.primeiroVencimento,
    estado.config.feriadosAtivos,
  ])

  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return [...estado.clientes]
      .filter((c) => {
        if (!termo) return true
        if (c.nome.toLowerCase().includes(termo)) return true
        return digitos.length > 0 && c.telefone.replace(/\D/g, '').includes(digitos)
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 30)
  }, [estado.clientes, buscaCliente])

  if (!ehProprietario) {
    return (
      <>
        <Cabecalho titulo="Novo contrato" voltarPara="/contratos" />
        <Aviso tipo="atencao">
          Criar contrato é uma ação do proprietário da operação. O assistente cadastra clientes,
          consulta informações e registra pagamentos.
        </Aviso>
      </>
    )
  }

  function definir<K extends keyof Rascunho>(chave: K, valor: Rascunho[K]) {
    setRascunho((r) => ({ ...r, [chave]: valor }))
    setErros((e) => {
      if (!e[chave as string]) return e
      const { [chave as string]: _i, ...resto } = e
      return resto
    })
  }

  function validarCondicoes(): boolean {
    const novos: Record<string, string> = {}
    if (principalCents <= 0) novos.valorTexto = 'Informe o valor emprestado.'
    if (taxaPercent < 0) novos.taxaTexto = 'A porcentagem não pode ser negativa.'
    if (!Number.isInteger(qtdParcelas) || qtdParcelas < 1 || qtdParcelas > 400)
      novos.qtdTexto = 'Informe a quantidade de parcelas (1 a 400).'
    if (!normalizarEntradaData(rascunho.primeiroVencimento))
      novos.primeiroVencimento = 'Informe o primeiro vencimento.'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  function salvar() {
    if (salvando.current || !resumo || !cliente) return
    salvando.current = true
    const contrato = criarContrato({
      clienteId: cliente.id,
      principalCents,
      taxaPercent,
      frequencia: rascunho.frequencia,
      qtdParcelas,
      primeiroVencimento: ajuste.ajustado,
      observacao: rascunho.observacao.trim() || undefined,
    })
    try {
      window.sessionStorage.removeItem(CHAVE_RASCUNHO)
    } catch {
      // ignora
    }
    navegar(`/contratos/${contrato.id}?criado=1`, { replace: true })
  }

  const passos = ['Cliente', 'Condições', 'Conferência']

  return (
    <>
      <Cabecalho
        titulo="Novo contrato"
        subtitulo={`Passo ${rascunho.passo + 1} de 3 · ${passos[rascunho.passo]}`}
        voltarPara="/contratos"
      />

      <div className="pilha">
        <div className="passos" aria-hidden>
          {passos.map((p, i) => (
            <span
              key={p}
              className={`passo ${i === rascunho.passo ? 'passo--ativo' : i < rascunho.passo ? 'passo--feito' : ''}`}
            />
          ))}
        </div>

        {rascunho.passo === 0 && (
          <>
            <CampoBusca
              valor={buscaCliente}
              aoMudar={setBuscaCliente}
              placeholder="Buscar cliente por nome ou telefone"
            />
            <button
              type="button"
              className="btn btn--secundario btn--bloco"
              onClick={() => navegar('/clientes/novo?retorno=/contratos/novo')}
            >
              <IconeAdicionar tamanho={16} />
              Cadastrar novo cliente
            </button>
            <p className="txt-peq" style={{ padding: '0 2px' }}>
              O contrato em preenchimento fica guardado enquanto você cadastra o cliente.
            </p>

            {clientesFiltrados.length === 0 ? (
              <Vazio titulo="Nenhum cliente encontrado" descricao="Cadastre o cliente para seguir." />
            ) : (
              <ul className="lista">
                {clientesFiltrados.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="item-lista"
                      onClick={() => setRascunho((r) => ({ ...r, clienteId: c.id, passo: 1 }))}
                    >
                      <span className="avatar" aria-hidden>
                        {c.nome.charAt(0).toUpperCase()}
                      </span>
                      <span className="item-lista__principal">
                        <span className="item-lista__titulo">{c.nome}</span>
                        <span className="item-lista__sub">{c.telefone}</span>
                      </span>
                      {rascunho.clienteId === c.id ? (
                        <IconeCheck tamanho={18} />
                      ) : (
                        <IconeSeta tamanho={18} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {rascunho.passo === 1 && (
          <>
            <Cartao titulo="Cliente">
              <div className="linha-entre">
                <span className="txt-forte">{cliente?.nome ?? 'Nenhum selecionado'}</span>
                <button
                  type="button"
                  className="btn btn--fantasma btn--pequeno"
                  onClick={() => setRascunho((r) => ({ ...r, passo: 0 }))}
                >
                  Trocar
                </button>
              </div>
            </Cartao>

            <Cartao>
              <div className="pilha">
                <Campo
                  rotulo="Valor emprestado"
                  htmlFor="valor"
                  obrigatorio
                  erro={erros.valorTexto}
                  dica="Somente o principal, sem juros."
                >
                  <input
                    id="valor"
                    className="entrada"
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={rascunho.valorTexto}
                    aria-invalid={Boolean(erros.valorTexto)}
                    onChange={(e) => definir('valorTexto', e.target.value)}
                  />
                </Campo>

                <div className="grade-2">
                  <Campo
                    rotulo="Porcentagem de juros"
                    htmlFor="taxa"
                    obrigatorio
                    erro={erros.taxaTexto}
                    dica="Aplicada uma vez."
                  >
                    <input
                      id="taxa"
                      className="entrada"
                      inputMode="decimal"
                      value={rascunho.taxaTexto}
                      aria-invalid={Boolean(erros.taxaTexto)}
                      onChange={(e) => definir('taxaTexto', e.target.value)}
                    />
                  </Campo>
                  <Campo
                    rotulo="Quantidade de parcelas"
                    htmlFor="qtd"
                    obrigatorio
                    erro={erros.qtdTexto}
                  >
                    <input
                      id="qtd"
                      className="entrada"
                      inputMode="numeric"
                      value={rascunho.qtdTexto}
                      aria-invalid={Boolean(erros.qtdTexto)}
                      onChange={(e) => definir('qtdTexto', e.target.value.replace(/\D/g, ''))}
                    />
                  </Campo>
                </div>

                <Campo rotulo="Frequência">
                  <Segmentado
                    rotuloGrupo="Frequência"
                    valor={rascunho.frequencia}
                    aoMudar={(v) => definir('frequencia', v)}
                    opcoes={[
                      { valor: 'diaria', rotulo: 'Diária' },
                      { valor: 'semanal', rotulo: 'Semanal' },
                      { valor: 'mensal', rotulo: 'Mensal' },
                    ]}
                  />
                </Campo>

                <Campo
                  rotulo="Primeiro vencimento"
                  htmlFor="primeiro"
                  obrigatorio
                  erro={erros.primeiroVencimento}
                >
                  <input
                    id="primeiro"
                    type="date"
                    className="entrada"
                    value={rascunho.primeiroVencimento}
                    onChange={(e) =>
                      definir(
                        'primeiroVencimento',
                        normalizarEntradaData(e.target.value) ?? rascunho.primeiroVencimento,
                      )
                    }
                  />
                </Campo>

                {ajuste.explicacao && <Aviso tipo="atencao">{ajuste.explicacao}</Aviso>}

                <Campo rotulo="Observação" htmlFor="obs" dica="Opcional.">
                  <textarea
                    id="obs"
                    className="area-texto"
                    value={rascunho.observacao}
                    onChange={(e) => definir('observacao', e.target.value)}
                  />
                </Campo>
              </div>
            </Cartao>

            <Aviso>{RESUMO_REGRAS_CALENDARIO[rascunho.frequencia]}</Aviso>

            {resumo && (
              <Cartao titulo="Prévia">
                <div className="dados">
                  <LinhaDado rotulo="Juros" valor={formatarMoeda(resumo.jurosCents)} />
                  <LinhaDado rotulo="Total contratado" valor={formatarMoeda(resumo.totalCents)} forte />
                  <LinhaDado
                    rotulo="Parcela"
                    valor={`${qtdParcelas}x ${formatarMoeda(resumo.valorParcelaCents)}`}
                  />
                </div>
              </Cartao>
            )}

            <div className="grade-2">
              <button
                type="button"
                className="btn btn--secundario"
                onClick={() => setRascunho((r) => ({ ...r, passo: 0 }))}
              >
                Voltar
              </button>
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => {
                  if (validarCondicoes()) setRascunho((r) => ({ ...r, passo: 2 }))
                }}
              >
                Conferir
              </button>
            </div>
          </>
        )}

        {rascunho.passo === 2 && resumo && cliente && (
          <>
            <Cartao titulo="Conferência">
              <div className="dados">
                <LinhaDado rotulo="Cliente" valor={cliente.nome} forte />
                <LinhaDado rotulo="Telefone" valor={cliente.telefone} />
                <LinhaDado rotulo="Principal" valor={formatarMoeda(resumo.principalCents)} />
                <LinhaDado rotulo="Taxa" valor={formatarPercentual(taxaPercent)} />
                <LinhaDado rotulo="Juros" valor={formatarMoeda(resumo.jurosCents)} />
                <LinhaDado rotulo="Total contratado" valor={formatarMoeda(resumo.totalCents)} forte />
                <LinhaDado
                  rotulo="Parcelas"
                  valor={`${qtdParcelas}x ${formatarMoeda(resumo.valorParcelaCents)}`}
                />
                <LinhaDado
                  rotulo="Frequência"
                  valor={
                    rascunho.frequencia === 'diaria'
                      ? 'Diária'
                      : rascunho.frequencia === 'semanal'
                        ? 'Semanal'
                        : 'Mensal'
                  }
                />
                <LinhaDado
                  rotulo="Primeiro vencimento"
                  valor={formatarData(resumo.vencimentos[0]?.data ?? ajuste.ajustado)}
                />
                <LinhaDado
                  rotulo="Último vencimento"
                  valor={formatarData(resumo.vencimentos[resumo.vencimentos.length - 1]?.data ?? '')}
                />
              </div>
            </Cartao>

            {resumo.parcelasDesiguais && (
              <Aviso>
                O total não divide exato: as primeiras parcelas ficam um centavo maiores para que a
                soma feche em {formatarMoeda(somar(resumo.valoresParcelas))}.
              </Aviso>
            )}

            {ajuste.explicacao && <Aviso tipo="atencao">{ajuste.explicacao}</Aviso>}

            <Cartao titulo={`Calendário — ${resumo.vencimentos.length} parcelas`}>
              <div className="tabela-rolagem" style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table className="tabela tabela--compacta">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vencimento</th>
                      <th>Dia</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.vencimentos.map((v, i) => (
                      <tr key={v.numero}>
                        <td>{v.numero}</td>
                        <td>
                          {formatarDataCurta(v.data)}
                          {v.deslocado && (
                            <span className="txt-peq"> · movido de {formatarDataCurta(v.dataBase)}</span>
                          )}
                        </td>
                        <td>{rotuloDiaSemanaCurto(v.data)}</td>
                        <td className="num">{formatarMoeda(resumo.valoresParcelas[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>

            <div className="grade-2">
              <button
                type="button"
                className="btn btn--secundario"
                onClick={() => setRascunho((r) => ({ ...r, passo: 1 }))}
              >
                Voltar
              </button>
              <button type="button" className="btn btn--primario" onClick={salvar}>
                Criar contrato
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
