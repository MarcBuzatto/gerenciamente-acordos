import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../state/loja'
import { Cabecalho } from '../components/Layout'
import { Aviso, CampoBusca, Vazio } from '../components/Base'
import { IconeAdicionar, IconeSeta } from '../components/Icones'
import { situacaoContrato } from '../../domain/cobranca'

function inicial(nome: string): string {
  return nome.trim().charAt(0).toUpperCase() || '?'
}

export function Clientes() {
  const { estado, dataReferencia, carregando, falha, recarregar } = useApp()
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')

  const contratosPorCliente = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const c of estado.contratos) {
      const parcelas = estado.parcelas.filter((p) => p.contratoId === c.id)
      if (situacaoContrato(parcelas, estado.pagamentos, dataReferencia) !== 'quitado') {
        mapa.set(c.clienteId, (mapa.get(c.clienteId) ?? 0) + 1)
      }
    }
    return mapa
  }, [estado, dataReferencia])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return [...estado.clientes]
      .filter((c) => {
        if (!termo) return true
        if (c.nome.toLowerCase().includes(termo)) return true
        return digitos.length > 0 && c.telefone.replace(/\D/g, '').includes(digitos)
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [estado.clientes, busca])

  return (
    <>
      <Cabecalho
        titulo="Clientes"
        subtitulo={`${estado.clientes.length} ${estado.clientes.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}`}
        acao={
          <Link to="/clientes/novo" className="btn btn--primario btn--pequeno" style={{ minHeight: 44 }}>
            <IconeAdicionar tamanho={16} />
            Novo
          </Link>
        }
      />

      <div className="pilha">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome ou telefone" />

        {falha && (
          <Aviso tipo="erro">
            {falha.message}{' '}
            <button
              type="button"
              className="btn btn--fantasma btn--pequeno"
              onClick={() => void recarregar()}
            >
              Tentar de novo
            </button>
          </Aviso>
        )}

        {carregando ? (
          <div className="lista" aria-busy="true">
            <div className="esqueleto" />
            <div className="esqueleto" />
            <div className="esqueleto" />
          </div>
        ) : lista.length === 0 ? (
          <Vazio
            titulo={busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            descricao={
              busca
                ? 'Confira o nome ou o telefone digitado.'
                : 'Cadastre o primeiro cliente para começar a criar contratos.'
            }
            acao={
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => navegar('/clientes/novo')}
              >
                <IconeAdicionar tamanho={16} />
                Novo cliente
              </button>
            }
          />
        ) : (
          <ul className="lista">
            {lista.map((c) => {
              const abertos = contratosPorCliente.get(c.id) ?? 0
              return (
                <li key={c.id}>
                  <Link to={`/clientes/${c.id}`} className="item-lista">
                    <span className="avatar" aria-hidden>
                      {inicial(c.nome)}
                    </span>
                    <span className="item-lista__principal">
                      <span className="item-lista__titulo">{c.nome}</span>
                      <span className="item-lista__sub">
                        {c.telefone}
                        {abertos > 0 &&
                          ` · ${abertos} ${abertos === 1 ? 'contrato aberto' : 'contratos abertos'}`}
                      </span>
                    </span>
                    <span className="item-lista__fim">
                      <IconeSeta tamanho={18} />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
