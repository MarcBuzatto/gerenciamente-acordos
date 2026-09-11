import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext'
import { Cabecalho } from '../components/Layout'
import { Aviso, CampoBusca, Vazio } from '../components/Base'
import { ItemParcela } from '../components/ItemParcela'
import { PainelPagamento } from '../components/PainelPagamento'
import { avaliarTodasParcelas } from '../../domain/indicadores'
import { compararDatas } from '../../domain/dates'
import { formatarMoeda } from '../../domain/dinheiro'
import type { ParcelaAvaliada } from '../../domain/tipos'

type Filtro = 'hoje' | 'atrasados' | 'proximos' | 'pagos'

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'atrasados', rotulo: 'Atrasados' },
  { id: 'proximos', rotulo: 'Próximos' },
  { id: 'pagos', rotulo: 'Pagos' },
]

export function Vencimentos() {
  const { estado, dataReferencia } = useApp()
  const [params, setParams] = useSearchParams()
  const filtro = (params.get('filtro') as Filtro) ?? 'hoje'
  const [busca, setBusca] = useState('')
  const [emPagamento, setEmPagamento] = useState<ParcelaAvaliada | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const posicaoScroll = useRef(0)

  const avaliadas = useMemo(
    () => avaliarTodasParcelas(estado, dataReferencia),
    [estado, dataReferencia],
  )

  const porFiltro = useMemo(() => {
    const hoje = avaliadas.filter((a) => a.situacao === 'hoje')
    const atrasados = avaliadas
      .filter((a) => a.situacao === 'atrasada')
      // Do vencimento mais antigo para o mais recente.
      .sort((a, b) => compararDatas(a.parcela.vencimento, b.parcela.vencimento))
    const proximos = avaliadas
      .filter((a) => a.situacao === 'a_vencer')
      .sort((a, b) => compararDatas(a.parcela.vencimento, b.parcela.vencimento))
    const pagos = avaliadas
      .filter((a) => a.situacao === 'paga')
      .sort((a, b) =>
        compararDatas(b.pagamento?.dataPagamento ?? '', a.pagamento?.dataPagamento ?? ''),
      )
    return { hoje, atrasados, proximos, pagos }
  }, [avaliadas])

  const lista = useMemo(() => {
    const base = porFiltro[filtro]
    const termo = busca.trim().toLowerCase()
    if (!termo) return base
    return base.filter(
      (a) =>
        a.cliente.nome.toLowerCase().includes(termo) ||
        a.cliente.telefone.replace(/\D/g, '').includes(termo.replace(/\D/g, '')) ||
        String(a.contrato.numero).includes(termo),
    )
  }, [porFiltro, filtro, busca])

  const totalLista = lista.reduce((s, a) => s + a.totalDevidoCents, 0)

  useEffect(() => {
    if (mensagem) {
      window.scrollTo({ top: posicaoScroll.current })
    }
  }, [mensagem])

  function trocarFiltro(f: Filtro) {
    const proximo = new URLSearchParams(params)
    proximo.set('filtro', f)
    setParams(proximo, { replace: true })
  }

  return (
    <>
      <Cabecalho titulo="Vencimentos" subtitulo="Cobranças do dia, atrasos e recebimentos" />

      <div className="pilha">
        {mensagem && <Aviso tipo="positivo">{mensagem}</Aviso>}

        <div className="filtros" role="group" aria-label="Filtrar vencimentos">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="filtro"
              aria-pressed={filtro === f.id}
              onClick={() => trocarFiltro(f.id)}
            >
              {f.rotulo}
              <span className="filtro__contagem">{porFiltro[f.id].length}</span>
            </button>
          ))}
        </div>

        <CampoBusca
          valor={busca}
          aoMudar={setBusca}
          placeholder="Buscar por cliente, telefone ou contrato"
        />

        {lista.length > 0 && (
          <div className="linha-entre" style={{ padding: '0 2px' }}>
            <span className="txt-sec">
              {lista.length} {lista.length === 1 ? 'parcela' : 'parcelas'}
            </span>
            <span className="txt-sec">
              {filtro === 'pagos' ? 'Total recebido' : 'Total'}:{' '}
              <strong className="num">{formatarMoeda(totalLista)}</strong>
            </span>
          </div>
        )}

        {filtro === 'atrasados' && porFiltro.atrasados.length > 0 && (
          <Aviso tipo="atencao">
            Diárias em atraso já estão com o acréscimo único aplicado. O valor não volta a crescer
            nos dias seguintes. Semanal e mensal aparecem em atraso sem acréscimo — regra pendente
            de validação.
          </Aviso>
        )}

        {lista.length === 0 ? (
          <Vazio
            titulo={
              busca
                ? 'Nenhuma parcela encontrada'
                : filtro === 'hoje'
                  ? 'Nada vencendo hoje'
                  : filtro === 'atrasados'
                    ? 'Nenhuma parcela em atraso'
                    : filtro === 'proximos'
                      ? 'Nenhuma parcela futura'
                      : 'Nenhum pagamento registrado'
            }
            descricao={
              busca
                ? 'Ajuste a busca ou troque o filtro.'
                : 'Troque o filtro ou a data de referência da demonstração.'
            }
          />
        ) : (
          <ul className="lista">
            {lista.map((item) => (
              <ItemParcela
                key={item.parcela.id}
                idAncora={`parcela-${item.parcela.id}`}
                item={item}
                aoRegistrar={(i) => {
                  posicaoScroll.current = window.scrollY
                  setMensagem(null)
                  setEmPagamento(i)
                }}
              />
            ))}
          </ul>
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
    </>
  )
}
