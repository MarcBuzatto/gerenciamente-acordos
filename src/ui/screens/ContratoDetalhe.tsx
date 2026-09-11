import { useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext'
import { Cabecalho } from '../components/Layout'
import {
  Aviso,
  Campo,
  Cartao,
  EtiquetaContrato,
  EtiquetaParcela,
  LinhaDado,
  Painel,
  Vazio,
} from '../components/Base'
import { PainelPagamento } from '../components/PainelPagamento'
import { ListaParcelas } from '../components/ListaParcelas'
import {
  IconeCompartilhar,
  IconeDesfazer,
  IconePix,
  IconeQuitar,
  IconeRelogio,
} from '../components/Icones'
import { formatarData, formatarDataHora, normalizarEntradaData, rotuloDiaSemanaCurto } from '../../domain/dates'
import { formatarMoeda, formatarPercentual } from '../../domain/dinheiro'
import { montarQuitacao } from '../../domain/cobranca'
import { resumirContrato } from '../../domain/indicadores'
import type { ParcelaAvaliada, Pagamento } from '../../domain/tipos'

const ROTULO_FREQUENCIA = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' } as const

export function ContratoDetalhe() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { estado, dataReferencia, ehProprietario, usuarios, estornarPagamento } = useApp()

  const [emPagamento, setEmPagamento] = useState<ParcelaAvaliada | null>(null)
  const [quitacaoAberta, setQuitacaoAberta] = useState(false)
  const [estorno, setEstorno] = useState<Pagamento | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(
    params.get('criado') ? 'Contrato criado. O calendário de parcelas já está gerado.' : null,
  )

  const contrato = estado.contratos.find((c) => c.id === id)
  const resumo = useMemo(
    () => (contrato ? resumirContrato(estado, contrato, dataReferencia) : null),
    [contrato, estado, dataReferencia],
  )

  if (!contrato || !resumo) {
    return (
      <>
        <Cabecalho titulo="Contrato" voltarPara="/contratos" />
        <Aviso tipo="erro">Contrato não encontrado nesta operação.</Aviso>
      </>
    )
  }

  const nomeUsuario = (uid: string) => usuarios.find((u) => u.id === uid)?.nome ?? 'Usuário'
  const emAberto = resumo.avaliadas.filter((a) => a.situacao !== 'paga')

  return (
    <>
      <Cabecalho
        titulo={`Contrato ${contrato.numero}`}
        subtitulo={resumo.cliente.nome}
        voltarPara="/contratos"
        acao={
          <Link
            to={`/contratos/${contrato.id}/extrato`}
            className="btn btn--secundario btn--pequeno"
            style={{ minHeight: 44 }}
          >
            <IconeCompartilhar tamanho={15} />
            Extrato
          </Link>
        }
      />

      <div className="pilha">
        {mensagem && <Aviso tipo="positivo">{mensagem}</Aviso>}

        <Cartao>
          <div className="linha-entre" style={{ marginBottom: 10 }}>
            <Link to={`/clientes/${resumo.cliente.id}`} className="txt-forte" style={{ fontSize: 16 }}>
              {resumo.cliente.nome}
            </Link>
            <EtiquetaContrato situacao={resumo.situacao} />
          </div>
          <div className="dados">
            <LinhaDado rotulo="Número" valor={String(contrato.numero)} />
            <LinhaDado rotulo="Data do contrato" valor={formatarData(contrato.dataContrato)} />
            <LinhaDado rotulo="Primeiro vencimento" valor={formatarData(contrato.primeiroVencimento)} />
            <LinhaDado rotulo="Frequência" valor={ROTULO_FREQUENCIA[contrato.frequencia]} />
            <LinhaDado rotulo="Principal" valor={formatarMoeda(contrato.principalCents)} />
            <LinhaDado rotulo="Taxa" valor={formatarPercentual(contrato.taxaPercent)} />
            <LinhaDado rotulo="Juros contratuais" valor={formatarMoeda(contrato.jurosCents)} />
            <LinhaDado rotulo="Total contratado" valor={formatarMoeda(contrato.totalCents)} forte />
            <LinhaDado
              rotulo="Acréscimos por atraso"
              valor={formatarMoeda(resumo.acrescimosPagosCents + resumo.avaliadas.filter((a) => a.situacao !== 'paga').reduce((s, a) => s + a.acrescimoCents, 0))}
            />
            <LinhaDado rotulo="Total pago" valor={formatarMoeda(resumo.totalPagoCents)} />
            <LinhaDado rotulo="Saldo" valor={formatarMoeda(resumo.saldoCents)} forte />
            {contrato.observacao && <LinhaDado rotulo="Observação" valor={contrato.observacao} />}
          </div>
        </Cartao>

        {ehProprietario && emAberto.length > 0 && (
          <button
            type="button"
            className="btn btn--secundario btn--bloco"
            onClick={() => setQuitacaoAberta(true)}
          >
            <IconeQuitar tamanho={16} />
            Quitação antecipada ({emAberto.length} parcelas)
          </button>
        )}

        <h2 className="secao-titulo">
          Parcelas · {resumo.qtdPagas} pagas · {resumo.qtdAtrasadas} atrasadas · {resumo.qtdAVencer} a
          vencer
        </h2>

        <ListaParcelas
          itens={resumo.avaliadas}
          aoRegistrar={(a) => {
            setMensagem(null)
            setEmPagamento(a)
          }}
        />

        <div className="tabela-rolagem so-largo">
          <table className="tabela">
            <thead>
              <tr>
                <th>#</th>
                <th>Vencimento</th>
                <th className="num">Valor</th>
                <th className="num">Acréscimo</th>
                <th className="num">Total</th>
                <th>Situação</th>
                <th>Pagamento</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {resumo.avaliadas.map((a) => (
                <tr key={a.parcela.id}>
                  <td>{a.parcela.numero}</td>
                  <td>
                    {rotuloDiaSemanaCurto(a.parcela.vencimento)} {formatarData(a.parcela.vencimento)}
                  </td>
                  <td className="num">{formatarMoeda(a.valorOriginalCents)}</td>
                  <td className="num">
                    {a.acrescimoCents > 0 ? formatarMoeda(a.acrescimoCents) : '—'}
                  </td>
                  <td className="num">{formatarMoeda(a.totalDevidoCents)}</td>
                  <td>
                    <EtiquetaParcela situacao={a.situacao} />
                  </td>
                  <td>{a.pagamento ? formatarData(a.pagamento.dataPagamento) : '—'}</td>
                  <td>
                    {a.situacao !== 'paga' && (
                      <button
                        type="button"
                        className="btn btn--primario btn--pequeno"
                        onClick={() => {
                          setMensagem(null)
                          setEmPagamento(a)
                        }}
                      >
                        <IconePix tamanho={14} />
                        Registrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="secao-titulo">Histórico de pagamentos e correções</h2>
        {resumo.pagamentos.length === 0 ? (
          <Vazio titulo="Sem lançamentos" descricao="Nenhum pagamento foi registrado neste contrato." />
        ) : (
          <ul className="lista">
            {[...resumo.pagamentos].reverse().map((p) => (
              <li key={p.id} className="cartao" style={{ padding: 12 }}>
                <div className="linha-entre">
                  <div className="crescer">
                    <div className="txt-forte">
                      {p.tipo === 'quitacao' ? 'Quitação antecipada' : `Parcela ${estado.parcelas.filter((x) => p.parcelaIds.includes(x.id)).map((x) => x.numero).join(', ')}`}
                      {p.estorno && ' · desfeito'}
                    </div>
                    <div className="txt-peq">
                      Recebido em {formatarData(p.dataPagamento)} · Pix ·{' '}
                      {formatarMoeda(p.valorTotalCents)}
                      {p.acrescimoCents > 0 && ` (${formatarMoeda(p.valorOriginalCents)} + ${formatarMoeda(p.acrescimoCents)})`}
                    </div>
                    <div className="txt-peq">
                      <IconeRelogio tamanho={12} /> Digitado em {formatarDataHora(p.registradoEm)} por{' '}
                      {nomeUsuario(p.registradoPor)}
                    </div>
                    {p.estorno && (
                      <div className="txt-peq" style={{ color: 'var(--vermelho-texto)' }}>
                        Desfeito em {formatarDataHora(p.estorno.em)} por {nomeUsuario(p.estorno.por)} ·
                        Motivo: {p.estorno.motivo}
                      </div>
                    )}
                  </div>
                  {ehProprietario && !p.estorno && (
                    <button
                      type="button"
                      className="btn btn--perigo btn--pequeno"
                      onClick={() => setEstorno(p)}
                    >
                      <IconeDesfazer tamanho={14} />
                      Desfazer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!ehProprietario && (
          <Aviso>
            Desfazer pagamento e quitação antecipada são ações do proprietário. Proposta inicial, a
            validar.
          </Aviso>
        )}
      </div>

      {emPagamento && (
        <PainelPagamento
          item={emPagamento}
          aoFechar={() => setEmPagamento(null)}
          aoConcluir={(m) => {
            setEmPagamento(null)
            setMensagem(m)
          }}
        />
      )}

      {quitacaoAberta && (
        <PainelQuitacao
          contratoId={contrato.id}
          aoFechar={() => setQuitacaoAberta(false)}
          aoConcluir={(m) => {
            setQuitacaoAberta(false)
            setMensagem(m)
          }}
        />
      )}

      {estorno && (
        <PainelEstorno
          pagamento={estorno}
          aoFechar={() => setEstorno(null)}
          aoConfirmar={(motivo) => {
            estornarPagamento(estorno.id, motivo)
            setEstorno(null)
            setMensagem('Pagamento desfeito. O registro original e o motivo ficam no histórico.')
          }}
        />
      )}
    </>
  )
}

function PainelQuitacao({
  contratoId,
  aoFechar,
  aoConcluir,
}: {
  contratoId: string
  aoFechar: () => void
  aoConcluir: (mensagem: string) => void
}) {
  const { estado, dataReferencia, registrarPagamento } = useApp()
  const [data, setData] = useState(dataReferencia)
  const enviando = useRef(false)
  const [travado, setTravado] = useState(false)

  const contrato = estado.contratos.find((c) => c.id === contratoId)!
  const cliente = estado.clientes.find((c) => c.id === contrato.clienteId)!
  const parcelas = estado.parcelas.filter((p) => p.contratoId === contratoId)

  const quitacao = useMemo(
    () => montarQuitacao(parcelas, contrato, cliente, estado.pagamentos, data),
    [parcelas, contrato, cliente, estado.pagamentos, data],
  )

  function confirmar() {
    if (enviando.current) return
    enviando.current = true
    setTravado(true)
    const pagamento = registrarPagamento({
      contratoId,
      parcelaIds: quitacao.parcelas.map((p) => p.parcela.id),
      dataPagamento: data,
      tipo: 'quitacao',
    })
    if (!pagamento) {
      enviando.current = false
      setTravado(false)
      return
    }
    aoConcluir(
      `Quitação registrada em ${formatarData(data)} — ${quitacao.parcelas.length} parcelas, ${formatarMoeda(pagamento.valorTotalCents)}.`,
    )
  }

  return (
    <Painel
      titulo="Quitação antecipada"
      subtitulo={`${cliente.nome} · Contrato ${contrato.numero}`}
      aoFechar={aoFechar}
      acoes={
        <>
          <button
            type="button"
            className="btn btn--primario btn--bloco"
            onClick={confirmar}
            disabled={travado || quitacao.parcelas.length === 0}
          >
            <IconeQuitar tamanho={17} />
            {travado ? 'Registrando…' : `Confirmar ${formatarMoeda(quitacao.totalCents)}`}
          </button>
          <button type="button" className="btn btn--secundario btn--bloco" onClick={aoFechar}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="pilha">
        <Campo
          rotulo="Data do recebimento"
          htmlFor="data-quitacao"
          dica={`${formatarData(data)} · parcelas ainda não vencidas entram pelo valor original, sem acréscimo.`}
        >
          <input
            id="data-quitacao"
            type="date"
            className="entrada"
            value={data}
            max={dataReferencia}
            onChange={(e) => setData(normalizarEntradaData(e.target.value) ?? data)}
          />
        </Campo>

        <Aviso>
          O saldo é cobrado integralmente, sem desconto dos juros contratuais. Não há renegociação,
          desconto nem pagamento parcial.
        </Aviso>

        <div className="tabela-rolagem" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table className="tabela tabela--compacta">
            <thead>
              <tr>
                <th>#</th>
                <th>Vencimento</th>
                <th className="num">Valor</th>
                <th className="num">Acréscimo</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {quitacao.parcelas.map((p) => (
                <tr key={p.parcela.id}>
                  <td>{p.parcela.numero}</td>
                  <td>{formatarData(p.parcela.vencimento)}</td>
                  <td className="num">{formatarMoeda(p.valorOriginalCents)}</td>
                  <td className="num">
                    {p.acrescimoCents > 0 ? formatarMoeda(p.acrescimoCents) : '—'}
                  </td>
                  <td className="num">{formatarMoeda(p.totalDevidoCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cartao cartao--plano" style={{ padding: 12 }}>
          <div className="dados">
            <LinhaDado rotulo="Parcelas" valor={String(quitacao.parcelas.length)} />
            <LinhaDado rotulo="Valor original" valor={formatarMoeda(quitacao.valorOriginalCents)} />
            <LinhaDado rotulo="Acréscimos" valor={formatarMoeda(quitacao.acrescimoCents)} />
            <LinhaDado rotulo="Total a receber" valor={formatarMoeda(quitacao.totalCents)} forte />
          </div>
        </div>
      </div>
    </Painel>
  )
}

function PainelEstorno({
  pagamento,
  aoFechar,
  aoConfirmar,
}: {
  pagamento: Pagamento
  aoFechar: () => void
  aoConfirmar: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Painel
      titulo="Desfazer pagamento"
      subtitulo={`${formatarMoeda(pagamento.valorTotalCents)} recebidos em ${formatarData(pagamento.dataPagamento)}`}
      aoFechar={aoFechar}
      acoes={
        <>
          <button
            type="button"
            className="btn btn--perigo btn--bloco"
            onClick={() => {
              if (motivo.trim().length < 3) {
                setErro('Escreva um motivo curto para a correção.')
                return
              }
              aoConfirmar(motivo.trim())
            }}
          >
            <IconeDesfazer tamanho={16} />
            Confirmar reversão
          </button>
          <button type="button" className="btn btn--secundario btn--bloco" onClick={aoFechar}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="pilha">
        <Aviso tipo="atencao">
          O lançamento original não é apagado. A reversão fica registrada com autor, horário e
          motivo, e os saldos são recalculados.
        </Aviso>
        <Campo rotulo="Motivo da correção" htmlFor="motivo" obrigatorio erro={erro}>
          <input
            id="motivo"
            className="entrada"
            value={motivo}
            placeholder="Ex.: lançado no contrato errado"
            onChange={(e) => {
              setMotivo(e.target.value)
              setErro(null)
            }}
          />
        </Campo>
      </div>
    </Painel>
  )
}
