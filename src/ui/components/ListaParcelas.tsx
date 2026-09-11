import { formatarData, rotuloDiaSemanaCurto } from '../../domain/dates'
import { formatarMoeda } from '../../domain/dinheiro'
import type { ParcelaAvaliada } from '../../domain/tipos'
import { EtiquetaParcela } from './Base'
import { IconePix } from './Icones'

/**
 * Lista empilhada das parcelas, usada em telas estreitas no lugar da tabela.
 * Evita colunas cortadas sem obrigar rolagem horizontal.
 */
export function ListaParcelas({
  itens,
  aoRegistrar,
}: {
  itens: ParcelaAvaliada[]
  aoRegistrar?: (item: ParcelaAvaliada) => void
}) {
  return (
    <div className="so-estreito">
      {itens.map((a) => (
        <div className="linha-parcela" key={a.parcela.id}>
          <span className="linha-parcela__numero">{a.parcela.numero}</span>
          <span>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>
              {rotuloDiaSemanaCurto(a.parcela.vencimento)} {formatarData(a.parcela.vencimento)}
            </span>
            <span className="txt-peq" style={{ display: 'block' }}>
              {formatarMoeda(a.valorOriginalCents)}
              {a.acrescimoCents > 0 && ` + ${formatarMoeda(a.acrescimoCents)} de acréscimo`}
              {a.pagamento && ` · pago em ${formatarData(a.pagamento.dataPagamento)}`}
            </span>
          </span>
          <span className="linha-parcela__fim">
            <EtiquetaParcela situacao={a.situacao} />
            <span className="valor-destaque" style={{ display: 'block', marginTop: 4 }}>
              {formatarMoeda(a.totalDevidoCents)}
            </span>
            {a.situacao !== 'paga' && aoRegistrar && (
              <button
                type="button"
                className="btn btn--primario btn--pequeno"
                style={{ marginTop: 6, minHeight: 40 }}
                onClick={() => aoRegistrar(a)}
              >
                <IconePix tamanho={14} />
                Registrar
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
