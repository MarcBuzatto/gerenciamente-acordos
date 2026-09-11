import { Link } from 'react-router-dom'
import { formatarData, formatarDataCurta, rotuloDiaSemanaCurto } from '../../domain/dates'
import { formatarMoeda } from '../../domain/dinheiro'
import type { ParcelaAvaliada } from '../../domain/tipos'
import { EtiquetaParcela } from './Base'
import { IconePix } from './Icones'

export function ItemParcela({
  item,
  aoRegistrar,
  idAncora,
}: {
  item: ParcelaAvaliada
  aoRegistrar?: (item: ParcelaAvaliada) => void
  idAncora?: string
}) {
  const { parcela, contrato, cliente, situacao } = item

  return (
    <li className="cartao" id={idAncora} style={{ padding: 12 }}>
      <div className="linha-entre" style={{ alignItems: 'flex-start' }}>
        <div className="crescer">
          <Link
            to={`/contratos/${contrato.id}`}
            className="item-lista__titulo"
            style={{ color: 'inherit', display: 'block' }}
          >
            {cliente.nome}
          </Link>
          <div className="item-lista__sub">
            Contrato {contrato.numero} · Parcela {parcela.numero}/{contrato.qtdParcelas} ·{' '}
            {rotuloDiaSemanaCurto(parcela.vencimento)} {formatarDataCurta(parcela.vencimento)}
          </div>
        </div>
        <EtiquetaParcela situacao={situacao} />
      </div>

      <div className="divisor" style={{ margin: '10px 0' }} />

      <div className="linha-entre" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="txt-peq">
            {situacao === 'paga' ? 'Recebido' : 'Valor devido'}
            {item.diasDeAtraso > 0 && ` · ${item.diasDeAtraso} ${item.diasDeAtraso === 1 ? 'dia' : 'dias'} de atraso`}
          </div>
          <div className="valor-destaque" style={{ fontSize: 18 }}>
            {formatarMoeda(item.totalDevidoCents)}
          </div>
          {item.acrescimoCents > 0 && (
            <div className="txt-peq">
              {formatarMoeda(item.valorOriginalCents)} + {formatarMoeda(item.acrescimoCents)} de
              acréscimo
            </div>
          )}
          {situacao === 'paga' && item.pagamento && (
            <div className="txt-peq">
              Pago em {formatarData(item.pagamento.dataPagamento)} · Pix
            </div>
          )}
        </div>

        {situacao !== 'paga' && aoRegistrar && (
          <button
            type="button"
            className="btn btn--primario btn--pequeno"
            style={{ minHeight: 44 }}
            onClick={() => aoRegistrar(item)}
          >
            <IconePix tamanho={16} />
            Registrar pagamento
          </button>
        )}
      </div>
    </li>
  )
}
