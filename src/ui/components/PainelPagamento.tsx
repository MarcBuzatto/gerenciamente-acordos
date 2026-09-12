import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../state/loja'
import { classificar, type LinhaVencimento } from '../../data/api'
import { formatarMoeda } from '../../domain/dinheiro'
import {
  compararDatas,
  formatarData,
  normalizarEntradaData,
  rotuloDiaSemana,
  type ISODate,
} from '../../domain/dates'
import { Aviso, Campo, LinhaDado, Painel } from './Base'
import { IconePix } from './Icones'

/**
 * Registro de pagamento.
 *
 * O valor devido na data escolhida é recalculado pelo SERVIDOR a cada mudança
 * de data — a tela nunca decide quanto entrou. E nada é dado como recebido
 * antes da confirmação: se a requisição falhar, aparece o erro, não o sucesso.
 */
export function PainelPagamento({
  item,
  aoFechar,
  aoConcluir,
}: {
  item: LinhaVencimento
  aoFechar: () => void
  aoConcluir: (mensagem: string) => void
}) {
  const { dataReferencia, registrarPagamento, valorDevidoEm } = useApp()
  const [dataPagamento, setDataPagamento] = useState<ISODate>(dataReferencia)
  const [erro, setErro] = useState<string | null>(null)
  const [calculo, setCalculo] = useState({
    valorOriginalCents: item.valorOriginalCents,
    acrescimoCents: item.situacao === 'paga' ? item.acrescimoCents : 0,
    totalCents: item.valorOriginalCents,
  })
  const [recalculando, setRecalculando] = useState(false)
  const enviando = useRef(false)
  const [travado, setTravado] = useState(false)

  const futuro = compararDatas(dataPagamento, dataReferencia) > 0
  const antesDoContrato = compararDatas(dataPagamento, item.dataContrato) < 0
  const retroativo = compararDatas(dataPagamento, dataReferencia) < 0
  const antecipado = compararDatas(dataPagamento, item.vencimento) < 0

  useEffect(() => {
    if (futuro || antesDoContrato) return
    let ativo = true
    setRecalculando(true)
    valorDevidoEm(item.parcelaId, dataPagamento)
      .then((r) => {
        if (ativo) setCalculo(r)
      })
      .catch((e) => {
        if (ativo) setErro(classificar(e).message)
      })
      .finally(() => {
        if (ativo) setRecalculando(false)
      })
    return () => {
      ativo = false
    }
  }, [item.parcelaId, dataPagamento, valorDevidoEm, futuro, antesDoContrato])

  async function confirmar() {
    if (enviando.current) return
    if (futuro) {
      setErro('A data do pagamento não pode ser posterior a hoje.')
      return
    }
    if (antesDoContrato) {
      setErro('A data do pagamento é anterior ao início do contrato.')
      return
    }
    enviando.current = true
    setTravado(true)
    setErro(null)
    try {
      await registrarPagamento({
        contratoId: item.contratoId,
        parcelaId: item.parcelaId,
        dataPagamento,
      })
      aoConcluir(
        `Parcela ${item.parcelaNumero} do contrato ${item.contratoNumero} registrada em ` +
          `${formatarData(dataPagamento)} — ${formatarMoeda(calculo.totalCents)}.`,
      )
    } catch (e) {
      // Falha de rede ou recusa do servidor: a parcela continua em aberto.
      setErro(classificar(e).message)
      enviando.current = false
      setTravado(false)
    }
  }

  return (
    <Painel
      titulo="Registrar pagamento"
      subtitulo={`${item.clienteNome} · Contrato ${item.contratoNumero} · Parcela ${item.parcelaNumero}/${item.qtdParcelas}`}
      aoFechar={aoFechar}
      acoes={
        <>
          <button
            type="button"
            className="btn btn--primario btn--bloco"
            onClick={() => void confirmar()}
            disabled={travado || futuro || antesDoContrato || recalculando}
          >
            <IconePix tamanho={17} />
            {travado ? 'Registrando…' : `Confirmar ${formatarMoeda(calculo.totalCents)}`}
          </button>
          <button type="button" className="btn btn--secundario btn--bloco" onClick={aoFechar}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="pilha">
        <div className="cartao cartao--plano" style={{ padding: 12 }}>
          <div className="dados">
            <LinhaDado rotulo="Vencimento" valor={formatarData(item.vencimento)} />
            <LinhaDado rotulo="Valor original" valor={formatarMoeda(calculo.valorOriginalCents)} />
            <LinhaDado
              rotulo="Acréscimo por atraso"
              valor={
                calculo.acrescimoCents > 0 ? (
                  <span style={{ color: 'var(--vermelho-texto)' }}>
                    + {formatarMoeda(calculo.acrescimoCents)}
                  </span>
                ) : (
                  formatarMoeda(0)
                )
              }
            />
            <LinhaDado rotulo="Total a receber" valor={formatarMoeda(calculo.totalCents)} forte />
          </div>
          {recalculando && <p className="txt-peq">Recalculando no servidor…</p>}
        </div>

        <Campo
          rotulo="Data real do pagamento"
          htmlFor="data-pagamento"
          dica={`${rotuloDiaSemana(dataPagamento)}, ${formatarData(dataPagamento)}. Use a data em que o Pix caiu, mesmo que esteja lançando depois.`}
          erro={erro}
        >
          <input
            id="data-pagamento"
            type="date"
            className="entrada"
            value={dataPagamento}
            max={dataReferencia}
            min={item.dataContrato}
            aria-invalid={futuro || antesDoContrato}
            onChange={(e) => {
              const d = normalizarEntradaData(e.target.value)
              setErro(null)
              if (d) setDataPagamento(d)
            }}
          />
        </Campo>

        {futuro && <Aviso tipo="erro">Não é possível registrar pagamento com data futura.</Aviso>}

        {antesDoContrato && (
          <Aviso tipo="erro">
            A data escolhida é anterior ao início do contrato ({formatarData(item.dataContrato)}).
          </Aviso>
        )}

        {retroativo && !futuro && !antesDoContrato && (
          <Aviso tipo="atencao">
            Recebimento retroativo. O valor é calculado pela data real ({formatarData(dataPagamento)})
            e entra no resumo desse dia, não no dia da digitação.
          </Aviso>
        )}

        {antecipado && !futuro && !antesDoContrato && (
          <Aviso tipo="positivo">Pagamento antes do vencimento. Sem acréscimo.</Aviso>
        )}

        <Campo
          rotulo="Meio de pagamento"
          dica="A operação recebe somente por Pix. Registro manual, sem integração bancária."
        >
          <div className="linha" style={{ gap: 8 }}>
            <span className="etiqueta etiqueta--paga" style={{ padding: '6px 12px', fontSize: 13 }}>
              <IconePix tamanho={15} />
              Pix
            </span>
            <span className="txt-peq">Valor integral. Não há pagamento parcial.</span>
          </div>
        </Campo>
      </div>
    </Painel>
  )
}
