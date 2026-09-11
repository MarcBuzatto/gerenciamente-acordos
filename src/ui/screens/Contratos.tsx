import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext'
import { Cabecalho } from '../components/Layout'
import { CampoBusca, EtiquetaContrato, Vazio } from '../components/Base'
import { IconeAdicionar, IconeContratos, IconeSeta } from '../components/Icones'
import { formatarMoeda } from '../../domain/dinheiro'
import { resumirContrato } from '../../domain/indicadores'
import type { SituacaoContrato } from '../../domain/tipos'

const ROTULO_FREQUENCIA = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' } as const

type FiltroSituacao = 'todos' | SituacaoContrato

const FILTROS: { id: FiltroSituacao; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'atrasado', rotulo: 'Em atraso' },
  { id: 'em_dia', rotulo: 'Em dia' },
  { id: 'quitado', rotulo: 'Quitados' },
]

export function Contratos() {
  const { estado, dataReferencia, ehProprietario } = useApp()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroSituacao>('todos')

  const resumos = useMemo(
    () =>
      estado.contratos
        .map((c) => resumirContrato(estado, c, dataReferencia))
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => b.contrato.numero - a.contrato.numero),
    [estado, dataReferencia],
  )

  const contagens = useMemo(() => {
    const base: Record<FiltroSituacao, number> = {
      todos: resumos.length,
      atrasado: 0,
      em_dia: 0,
      quitado: 0,
    }
    for (const r of resumos) base[r.situacao] += 1
    return base
  }, [resumos])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return resumos.filter((r) => {
      if (filtro !== 'todos' && r.situacao !== filtro) return false
      if (!termo) return true
      return (
        r.cliente.nome.toLowerCase().includes(termo) || String(r.contrato.numero).includes(termo)
      )
    })
  }, [resumos, filtro, busca])

  return (
    <>
      <Cabecalho
        titulo="Contratos"
        subtitulo={`${resumos.length} no total · ${contagens.atrasado} em atraso`}
        acao={
          ehProprietario ? (
            <Link to="/contratos/novo" className="btn btn--primario btn--pequeno" style={{ minHeight: 44 }}>
              <IconeAdicionar tamanho={16} />
              Novo
            </Link>
          ) : undefined
        }
      />

      <div className="pilha">
        <CampoBusca
          valor={busca}
          aoMudar={setBusca}
          placeholder="Buscar por cliente ou número do contrato"
        />

        <div className="filtros" role="group" aria-label="Filtrar por situação">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="filtro"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
            >
              {f.rotulo}
              <span className="filtro__contagem">{contagens[f.id]}</span>
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <Vazio
            titulo={busca || filtro !== 'todos' ? 'Nenhum contrato nesse filtro' : 'Nenhum contrato'}
            descricao={
              ehProprietario
                ? 'Crie um contrato para gerar o calendário de parcelas.'
                : 'Os contratos são criados pelo proprietário da operação.'
            }
            acao={
              ehProprietario ? (
                <Link to="/contratos/novo" className="btn btn--primario">
                  <IconeContratos tamanho={16} />
                  Novo contrato
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="lista">
            {lista.map((r) => (
              <li key={r.contrato.id}>
                <Link to={`/contratos/${r.contrato.id}`} className="item-lista">
                  <span className="item-lista__principal">
                    <span className="item-lista__titulo">{r.cliente.nome}</span>
                    <span className="item-lista__sub">
                      Contrato {r.contrato.numero} · {ROTULO_FREQUENCIA[r.contrato.frequencia]} ·{' '}
                      {formatarMoeda(r.contrato.totalCents)} em {r.contrato.qtdParcelas}x
                    </span>
                    <span className="item-lista__sub">
                      {r.qtdPagas}/{r.contrato.qtdParcelas} pagas
                      {r.qtdAtrasadas > 0 && ` · ${r.qtdAtrasadas} em atraso`}
                    </span>
                  </span>
                  <span className="item-lista__fim">
                    <EtiquetaContrato situacao={r.situacao} />
                    <span className="valor-destaque">{formatarMoeda(r.saldoCents)}</span>
                    <span className="txt-peq">saldo</span>
                  </span>
                  <IconeSeta tamanho={18} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
