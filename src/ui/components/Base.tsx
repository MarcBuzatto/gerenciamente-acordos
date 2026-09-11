import { useEffect, useRef, type ReactNode } from 'react'
import { IconeAtencao, IconeBusca, IconeCheck, IconeFechar, IconeInfo } from './Icones'
import type { SituacaoContrato, SituacaoParcela } from '../../domain/tipos'
import { ROTULO_SITUACAO_CONTRATO, ROTULO_SITUACAO_PARCELA } from '../../domain/cobranca'

export function Cartao({
  children,
  className = '',
  titulo,
  acao,
}: {
  children: ReactNode
  className?: string
  titulo?: string
  acao?: ReactNode
}) {
  return (
    <section className={`cartao ${className}`}>
      {(titulo || acao) && (
        <div className="linha-entre" style={{ marginBottom: 10 }}>
          {titulo ? <h2 className="cartao__titulo">{titulo}</h2> : <span />}
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}

export function EtiquetaParcela({ situacao }: { situacao: SituacaoParcela }) {
  return (
    <span className={`etiqueta etiqueta--${situacao}`}>
      {situacao === 'paga' && <IconeCheck tamanho={13} />}
      {ROTULO_SITUACAO_PARCELA[situacao]}
    </span>
  )
}

export function EtiquetaContrato({ situacao }: { situacao: SituacaoContrato }) {
  return (
    <span className={`etiqueta etiqueta--${situacao}`}>{ROTULO_SITUACAO_CONTRATO[situacao]}</span>
  )
}

export function Campo({
  rotulo,
  children,
  dica,
  erro,
  htmlFor,
  obrigatorio,
}: {
  rotulo: string
  children: ReactNode
  dica?: string
  erro?: string | null
  htmlFor?: string
  obrigatorio?: boolean
}) {
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={htmlFor}>
        {rotulo}
        {obrigatorio && <span aria-hidden> *</span>}
      </label>
      {children}
      {dica && !erro && <span className="campo__dica">{dica}</span>}
      {erro && (
        <span className="campo__erro" role="alert">
          {erro}
        </span>
      )}
    </div>
  )
}

export function Aviso({
  tipo = 'neutro',
  children,
}: {
  tipo?: 'neutro' | 'atencao' | 'erro' | 'positivo'
  children: ReactNode
}) {
  const classe = tipo === 'neutro' ? '' : `aviso--${tipo}`
  const Icone = tipo === 'atencao' || tipo === 'erro' ? IconeAtencao : tipo === 'positivo' ? IconeCheck : IconeInfo
  return (
    <div className={`aviso ${classe}`}>
      <Icone tamanho={17} />
      <div>{children}</div>
    </div>
  )
}

export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
}) {
  return (
    <div className="vazio">
      <span className="vazio__titulo">{titulo}</span>
      {descricao && <p style={{ fontSize: 13.5, maxWidth: 340 }}>{descricao}</p>}
      {acao}
    </div>
  )
}

export function CampoBusca({
  valor,
  aoMudar,
  placeholder,
  id,
}: {
  valor: string
  aoMudar: (v: string) => void
  placeholder: string
  id?: string
}) {
  return (
    <div className="busca">
      <span className="busca__icone">
        <IconeBusca />
      </span>
      <input
        id={id}
        type="search"
        className="entrada"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}

export function LinhaDado({
  rotulo,
  valor,
  forte,
}: {
  rotulo: string
  valor: ReactNode
  forte?: boolean
}) {
  return (
    <div className="dados__linha">
      <span className="dados__rotulo">{rotulo}</span>
      <span className={`dados__valor ${forte ? 'dados__valor--forte' : ''}`}>{valor}</span>
    </div>
  )
}

export function Painel({
  titulo,
  subtitulo,
  aoFechar,
  children,
  acoes,
}: {
  titulo: string
  subtitulo?: ReactNode
  aoFechar: () => void
  children: ReactNode
  acoes?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = anterior
      window.removeEventListener('keydown', aoTeclar)
    }
  }, [aoFechar])

  return (
    <div
      className="sobreposicao nao-imprimir"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <div className="painel" ref={ref} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="painel__alca" />
        <div className="painel__cabecalho">
          <div className="crescer">
            <div className="painel__titulo">{titulo}</div>
            {subtitulo && <div className="txt-sec">{subtitulo}</div>}
          </div>
          <button type="button" className="btn-icone" onClick={aoFechar} aria-label="Fechar">
            <IconeFechar />
          </button>
        </div>
        {children}
        {acoes && <div className="painel__acoes">{acoes}</div>}
      </div>
    </div>
  )
}

export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotuloGrupo,
}: {
  opcoes: { valor: T; rotulo: string }[]
  valor: T
  aoMudar: (v: T) => void
  rotuloGrupo: string
}) {
  return (
    <div className="seletor-segmentado" role="group" aria-label={rotuloGrupo}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export function Recolhivel({
  titulo,
  children,
  aberto,
}: {
  titulo: string
  children: ReactNode
  aberto?: boolean
}) {
  return (
    <details className="secao-recolhivel" open={aberto}>
      <summary>{titulo}</summary>
      <div className="secao-recolhivel__corpo">{children}</div>
    </details>
  )
}
