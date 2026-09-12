import { Link } from 'react-router-dom'
import { formatarData, formatarDataCurta, rotuloDiaSemanaCurto } from '../../domain/dates'
import { formatarMoeda } from '../../domain/dinheiro'
import type { LinhaVencimento } from '../../data/api'
import { EtiquetaParcela } from './Base'
import { IconePix } from './Icones'

export function ItemParcela({
  item,
  aoRegistrar,
  idAncora,
  permiteAbrirContrato = true,
}: {
  item: LinhaVencimento
  aoRegistrar?: (item: LinhaVencimento) => void
  idAncora?: string
  /** O assistente não abre a tela de contrato: ela mostra capital e juros. */
  permiteAbrirContrato?: boolean
}) {
  const titulo = permiteAbrirContrato ? (
    <Link
      to={`/contratos/${item.contratoId}`}
      className="item-lista__titulo"
      style={{ color: 'inherit', display: 'block' }}
    >
      {item.clienteNome}
    </Link>
  ) : (
    <span className="item-lista__titulo">{item.clienteNome}</span>
  )

  return (
    <li className="cartao" id={idAncora} style={{ padding: 12 }}>
      <div className="linha-entre" style={{ alignItems: 'flex-start' }}>
        <div className="crescer">
          {titulo}
          <div className="item-lista__sub">
            Contrato {item.contratoNumero} · Parcela {item.parcelaNumero}/{item.qtdParcelas} ·{' '}
            {rotuloDiaSemanaCurto(item.vencimento)} {formatarDataCurta(item.vencimento)}
          </div>
        </div>
        <EtiquetaParcela situacao={item.situacao} />
      </div>

      <div className="divisor" style={{ margin: '10px 0' }} />

      <div className="linha-entre" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="txt-peq">
            {item.situacao === 'paga' ? 'Recebido' : 'Valor devido'}
            {item.diasDeAtraso > 0 &&
              ` · ${item.diasDeAtraso} ${item.diasDeAtraso === 1 ? 'dia' : 'dias'} de atraso`}
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
          {item.situacao === 'paga' && item.dataPagamento && (
            <div className="txt-peq">Pago em {formatarData(item.dataPagamento)} · Pix</div>
          )}
        </div>

        {item.situacao !== 'paga' && aoRegistrar && (
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
