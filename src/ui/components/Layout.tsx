import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../state/loja'
import { formatarData, rotuloDiaSemanaCurto } from '../../domain/dates'
import { FerramentaDemo } from './FerramentaDemo'
import {
  IconeAjustes,
  IconeClientes,
  IconeContratos,
  IconeInicio,
  IconeMais,
  IconeVencimentos,
  IconeVoltar,
} from './Icones'

interface ItemNav {
  para: string
  rotulo: string
  Icone: (p: { tamanho?: number }) => JSX.Element
}

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, dataReferencia, demo, ehProprietario, operacao } = useApp()
  const [ferramentaAberta, setFerramentaAberta] = useState(false)
  const local = useLocation()

  // A navegação acompanha o perfil: o assistente não abre contratos, porque
  // essa tela mostra principal, juros e totais — dados que ele não acessa.
  const itens: ItemNav[] = [
    { para: '/', rotulo: ehProprietario ? 'Início' : 'Hoje', Icone: IconeInicio },
    { para: '/clientes', rotulo: 'Clientes', Icone: IconeClientes },
    ...(ehProprietario
      ? [{ para: '/contratos', rotulo: 'Contratos', Icone: IconeContratos }]
      : []),
    { para: '/vencimentos', rotulo: 'Vencimentos', Icone: IconeVencimentos },
    { para: '/mais', rotulo: 'Mais', Icone: IconeMais },
  ]

  const ehExtrato = local.pathname.endsWith('/extrato')

  return (
    <div className="app">
      {demo ? (
        <div className="faixa-demo nao-imprimir">
          <span className="faixa-demo__ponto" aria-hidden />
          <span className="faixa-demo__texto">
            Demonstração — dados fictícios · {rotuloDiaSemanaCurto(dataReferencia)}{' '}
            {formatarData(dataReferencia)}
          </span>
          <button
            type="button"
            className="faixa-demo__botao"
            onClick={() => setFerramentaAberta(true)}
          >
            <IconeAjustes tamanho={13} />
            Ajustar demo
          </button>
        </div>
      ) : (
        <div className="faixa-demo faixa-demo--producao nao-imprimir">
          <span className="faixa-demo__texto">
            {operacao.nome}
            {dataReferencia && ` · ${rotuloDiaSemanaCurto(dataReferencia)} ${formatarData(dataReferencia)}`}
          </span>
          <span className="faixa-demo__texto" style={{ flex: 'none', opacity: 0.75 }}>
            {usuario.perfil === 'proprietario' ? 'Proprietário' : 'Assistente'}
          </span>
        </div>
      )}

      <div className="corpo-com-lateral">
        <nav
          className="nav-lateral nao-imprimir"
          aria-label="Seções"
          style={{ ['--qtd-nav' as string]: itens.length }}
        >
          {itens.map((i) => (
            <NavLink key={i.para} to={i.para} end={i.para === '/'} className="nav-lateral__item">
              {({ isActive }) => (
                <>
                  <i.Icone tamanho={19} />
                  <span>{i.rotulo}</span>
                  <span className="so-leitor">{isActive ? '(seção atual)' : ''}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <main className="conteudo">{children}</main>
      </div>

      {!ehExtrato && (
        <nav
          className="nav-inferior nao-imprimir"
          aria-label="Navegação principal"
          style={{ gridTemplateColumns: `repeat(${itens.length}, 1fr)` }}
        >
          {itens.map((i) => (
            <NavLink
              key={i.para}
              to={i.para}
              end={i.para === '/'}
              className="nav-inferior__item"
              style={{ position: 'relative' }}
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="nav-inferior__marca" aria-hidden />}
                  <i.Icone tamanho={21} />
                  <span>{i.rotulo}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}

      {ferramentaAberta && demo && <FerramentaDemo aoFechar={() => setFerramentaAberta(false)} />}
    </div>
  )
}

export function Cabecalho({
  titulo,
  subtitulo,
  voltarPara,
  acao,
}: {
  titulo: string
  subtitulo?: string
  voltarPara?: string
  acao?: ReactNode
}) {
  const navegar = useNavigate()
  return (
    <header className="cabecalho cabecalho--com-faixa nao-imprimir">
      {voltarPara !== undefined && (
        <button
          type="button"
          className="btn-icone"
          aria-label="Voltar"
          onClick={() => (voltarPara ? navegar(voltarPara) : navegar(-1))}
        >
          <IconeVoltar />
        </button>
      )}
      <div className="cabecalho__titulo">
        <h1>{titulo}</h1>
        {subtitulo && <div className="cabecalho__sub">{subtitulo}</div>}
      </div>
      {acao}
    </header>
  )
}
