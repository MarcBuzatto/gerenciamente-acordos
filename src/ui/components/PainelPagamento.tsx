import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../state/AppContext'
import { acrescimoPorAtraso } from '../../domain/cobranca'
import { formatarMoeda } from '../../domain/dinheiro'
import {
  compararDatas,
  formatarData,
  normalizarEntradaData,
  rotuloDiaSemana,
  type ISODate,
} from '../../domain/dates'
import type { ParcelaAvaliada } from '../../domain/tipos'
import { Aviso, Campo, LinhaDado, Painel } from './Base'
import { IconePix } from './Icones'

export function PainelPagamento({
  item,
  aoFechar,
  aoConcluir,
}: {
  item: ParcelaAvaliada
  aoFechar: () => void
  aoConcluir: (mensagem: string) => void
}) {
  const { dataReferencia, registrarPagamento } = useApp()
  const [dataPagamento, setDataPagamento] = useState<ISODate>(dataReferencia)
  const [erro, setErro] = useState<string | null>(null)
  const enviando = useRef(false)
  const [travado, setTravado] = useState(false)

  const futuro = compararDatas(dataPagamento, dataReferencia) > 0

  const calculo = useMemo(() => {
    const acrescimo = acrescimoPorAtraso(item.parcela, item.contrato, dataPagamento)
    return {
      acrescimo,
      total: item.parcela.valorCents + acrescimo,
    }
  }, [item, dataPagamento])

  const retroativo = compararDatas(dataPagamento, dataReferencia) < 0
  const antecipado = compararDatas(dataPagamento, item.parcela.vencimento) < 0

  function confirmar() {
    if (enviando.current) return
    if (futuro) {
      setErro('A data do pagamento não pode ser posterior à data de hoje.')
      return
    }
    enviando.current = true
    setTravado(true)
    const pagamento = registrarPagamento({
      contratoId: item.contrato.id,
      parcelaIds: [item.parcela.id],
      dataPagamento,
      tipo: 'parcela',
    })
    if (!pagamento) {
      enviando.current = false
      setTravado(false)
      setErro('Esta parcela já consta como paga. Nada foi registrado.')
      return
    }
    aoConcluir(
      `Parcela ${item.parcela.numero} do contrato ${item.contrato.numero} registrada em ${formatarData(dataPagamento)} — ${formatarMoeda(pagamento.valorTotalCents)}.`,
    )
  }

  return (
    <Painel
      titulo="Registrar pagamento"
      subtitulo={`${item.cliente.nome} · Contrato ${item.contrato.numero} · Parcela ${item.parcela.numero}/${item.contrato.qtdParcelas}`}
      aoFechar={aoFechar}
      acoes={
        <>
          <button
            type="button"
            className="btn btn--primario btn--bloco"
            onClick={confirmar}
            disabled={travado || futuro}
          >
            <IconePix tamanho={17} />
            {travado ? 'Registrando…' : `Confirmar ${formatarMoeda(calculo.total)}`}
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
            <LinhaDado rotulo="Vencimento" valor={formatarData(item.parcela.vencimento)} />
            <LinhaDado rotulo="Valor original" valor={formatarMoeda(item.parcela.valorCents)} />
            <LinhaDado
              rotulo="Acréscimo por atraso"
              valor={
                calculo.acrescimo > 0 ? (
                  <span style={{ color: 'var(--vermelho-texto)' }}>
                    + {formatarMoeda(calculo.acrescimo)}
                  </span>
                ) : (
                  formatarMoeda(0)
                )
              }
            />
            <LinhaDado rotulo="Total a receber" valor={formatarMoeda(calculo.total)} forte />
          </div>
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
            min={item.contrato.dataContrato}
            aria-invalid={futuro}
            onChange={(e) => {
              const d = normalizarEntradaData(e.target.value)
              setErro(null)
              if (d) setDataPagamento(d)
            }}
          />
        </Campo>

        {futuro && <Aviso tipo="erro">Não é possível registrar pagamento com data futura.</Aviso>}

        {retroativo && !futuro && (
          <Aviso tipo="atencao">
            Recebimento retroativo. O valor é calculado pela data real ({formatarData(dataPagamento)})
            e entra no painel desse dia, não no dia da digitação.
          </Aviso>
        )}

        {antecipado && !futuro && (
          <Aviso tipo="positivo">
            Pagamento antes do vencimento. Sem acréscimo.
          </Aviso>
        )}

        <Campo rotulo="Meio de pagamento" dica="A operação recebe somente por Pix. Registro manual, sem integração bancária.">
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
