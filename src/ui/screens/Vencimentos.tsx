import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../state/loja'
import { Cabecalho } from '../components/Layout'
import { Aviso, CampoBusca, Vazio } from '../components/Base'
import { ItemParcela } from '../components/ItemParcela'
import { PainelPagamento } from '../components/PainelPagamento'
import { classificar, type FiltroVencimento, type LinhaVencimento } from '../../data/api'
import { formatarMoeda } from '../../domain/dinheiro'

type Filtro = Exclude<FiltroVencimento, 'todos'>

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'atrasados', rotulo: 'Atrasados' },
  { id: 'proximos', rotulo: 'Próximos' },
  { id: 'pagos', rotulo: 'Pagos' },
]

export function Vencimentos() {
  const { buscarVencimentos, ehProprietario, carregando: carregandoApp } = useApp()
  const [params, setParams] = useSearchParams()
  const filtro = (params.get('filtro') as Filtro) ?? 'hoje'
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<LinhaVencimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [falha, setFalha] = useState<string | null>(null)
  const [emPagamento, setEmPagamento] = useState<LinhaVencimento | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const posicaoScroll = useRef(0)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setFalha(null)
    try {
      setLista(await buscarVencimentos(filtro, busca))
    } catch (e) {
      setFalha(classificar(e).message)
      setLista([])
    } finally {
      setCarregando(false)
    }
  }, [buscarVencimentos, filtro, busca])

  useEffect(() => {
    // Espera a primeira carga do contexto para não pedir antes de ter operação.
    if (carregandoApp) return
    const t = setTimeout(() => void carregar(), busca ? 250 : 0)
    return () => clearTimeout(t)
  }, [carregar, carregandoApp, busca])

  useEffect(() => {
    if (mensagem) window.scrollTo({ top: posicaoScroll.current })
  }, [mensagem])

  function trocarFiltro(f: Filtro) {
    const proximo = new URLSearchParams(params)
    proximo.set('filtro', f)
    setParams(proximo, { replace: true })
  }

  const total = lista.reduce((s, a) => s + a.totalDevidoCents, 0)

  return (
    <>
      <Cabecalho titulo="Vencimentos" subtitulo="Cobranças do dia, atrasos e recebimentos" />

      <div className="pilha">
        {mensagem && <Aviso tipo="positivo">{mensagem}</Aviso>}
        {falha && (
          <Aviso tipo="erro">
            {falha}{' '}
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => void carregar()}>
              Tentar de novo
            </button>
          </Aviso>
        )}

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
            </button>
          ))}
        </div>

        <CampoBusca
          valor={busca}
          aoMudar={setBusca}
          placeholder="Buscar por cliente, telefone ou contrato"
        />

        {!carregando && lista.length > 0 && (
          <div className="linha-entre" style={{ padding: '0 2px' }}>
            <span className="txt-sec">
              {lista.length} {lista.length === 1 ? 'parcela' : 'parcelas'}
            </span>
            <span className="txt-sec">
              {filtro === 'pagos' ? 'Total recebido' : 'Total'}:{' '}
              <strong className="num">{formatarMoeda(total)}</strong>
            </span>
          </div>
        )}

        {filtro === 'atrasados' && !carregando && lista.length > 0 && (
          <Aviso tipo="atencao">
            Diárias em atraso já estão com o acréscimo único aplicado. O valor não volta a crescer
            nos dias seguintes. Semanal e mensal aparecem em atraso sem acréscimo — regra pendente
            de validação.
          </Aviso>
        )}

        {carregando ? (
          <div className="lista" aria-busy="true" aria-label="Carregando cobranças">
            <div className="esqueleto" style={{ height: 112 }} />
            <div className="esqueleto" style={{ height: 112 }} />
            <div className="esqueleto" style={{ height: 112 }} />
          </div>
        ) : lista.length === 0 && !falha ? (
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
              busca ? 'Ajuste a busca ou troque o filtro.' : 'Troque o filtro para ver outras cobranças.'
            }
          />
        ) : (
          <ul className="lista">
            {lista.map((item) => (
              <ItemParcela
                key={item.parcelaId}
                idAncora={`parcela-${item.parcelaId}`}
                item={item}
                permiteAbrirContrato={ehProprietario}
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
            void carregar()
          }}
        />
      )}
    </>
  )
}
