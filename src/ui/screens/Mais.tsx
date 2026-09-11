import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../state/AppContext'
import { Cabecalho } from '../components/Layout'
import { Aviso, Cartao, LinhaDado } from '../components/Base'
import {
  IconeAjustes,
  IconeCalendario,
  IconeContratos,
  IconeRestaurar,
  IconeSeta,
  IconeUsuario,
} from '../components/Icones'
import { REGRAS_FERIADO, feriadosDoAno } from '../../domain/feriados'
import { formatarData, partes } from '../../domain/dates'

export function Mais() {
  const {
    operacao,
    usuario,
    usuarios,
    ehProprietario,
    estado,
    dataReferencia,
    definirFeriadosAtivos,
    restaurarDemonstracao,
  } = useApp()
  const [confirmando, setConfirmando] = useState(false)

  const ano = partes(dataReferencia).ano
  const ativos = estado.config.feriadosAtivos
  const doAno = feriadosDoAno(ano, ativos)
  const assistentes = usuarios.filter((u) => u.perfil === 'assistente')

  function alternar(id: string) {
    const proximo = ativos.includes(id) ? ativos.filter((x) => x !== id) : [...ativos, id]
    definirFeriadosAtivos(proximo)
  }

  return (
    <>
      <Cabecalho titulo="Mais" subtitulo={`${operacao.nome} · ${usuario.nome}`} />

      <div className="pilha">
        <Cartao titulo="Operação">
          <div className="dados">
            <LinhaDado rotulo="Nome" valor={operacao.nome} forte />
            <LinhaDado rotulo="Responsável" valor={operacao.responsavel} />
            <LinhaDado rotulo="Cidade de referência" valor={operacao.cidade} />
            <LinhaDado rotulo="Fuso das datas" valor="America/Bahia" />
            <LinhaDado rotulo="Clientes" valor={String(estado.clientes.length)} />
            <LinhaDado rotulo="Contratos" valor={String(estado.contratos.length)} />
          </div>
          <p className="txt-peq" style={{ marginTop: 10 }}>
            Cada operação tem conta e dados próprios. Nada é compartilhado entre operações.
          </p>
        </Cartao>

        <Cartao titulo="Acesso do assistente">
          <div className="pilha-sm">
            {assistentes.map((a) => (
              <div key={a.id} className="linha" style={{ gap: 10 }}>
                <span className="avatar" aria-hidden>
                  {a.nome.charAt(0)}
                </span>
                <div className="crescer">
                  <div className="txt-forte">{a.nome}</div>
                  <div className="txt-peq">Assistente · {a.telefone}</div>
                </div>
                <span className="etiqueta etiqueta--neutra">Ativo</span>
              </div>
            ))}
            <div className="divisor" />
            <p className="txt-sec" style={{ fontSize: 13 }}>
              O assistente cadastra clientes, consulta o que precisa para cobrar e registra
              pagamentos. Não vê indicadores gerais, não cria contratos, não altera regras
              financeiras e não desfaz pagamentos.
            </p>
            <Aviso>
              Convite de assistente não é enviado nesta demonstração. As permissões acima são
              proposta inicial e precisam ser validadas.
            </Aviso>
          </div>
        </Cartao>

        <Link to="/mais/regras" className="item-lista">
          <span className="avatar" aria-hidden style={{ background: 'var(--verde-50)' }}>
            <IconeContratos tamanho={18} />
          </span>
          <span className="item-lista__principal">
            <span className="item-lista__titulo">Regras e pendências</span>
            <span className="item-lista__sub">
              O que está confirmado, o que é provisório e o que falta validar
            </span>
          </span>
          <IconeSeta tamanho={18} />
        </Link>

        {ehProprietario && (
          <Cartao
            titulo={`Calendário de cobrança — feriados de ${ano}`}
            acao={<IconeCalendario tamanho={17} />}
          >
            <p className="txt-peq" style={{ marginBottom: 10 }}>
              Domingos nunca contam como dia de cobrança. Os feriados marcados abaixo também são
              pulados na geração dos vencimentos.
            </p>
            <div className="pilha-sm">
              {REGRAS_FERIADO.map((r) => {
                const data = doAno.find((f) => f.regra.id === r.id)?.data
                const ligado = ativos.includes(r.id)
                return (
                  <label
                    key={r.id}
                    className="linha"
                    style={{
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--borda)',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ligado}
                      onChange={() => alternar(r.id)}
                      style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--verde-700)' }}
                    />
                    <span className="crescer">
                      <span className="txt-forte" style={{ display: 'block', fontSize: 14 }}>
                        {r.nome}
                        {data ? ` · ${formatarData(data)}` : ''}
                      </span>
                      <span className="txt-peq">{r.fonte}</span>
                    </span>
                    <span
                      className={`etiqueta ${r.procedencia === 'confirmado' ? 'etiqueta--paga' : 'etiqueta--hoje'}`}
                    >
                      {r.procedencia === 'confirmado' ? 'Confirmado' : 'A confirmar'}
                    </span>
                  </label>
                )
              })}
            </div>
            <Aviso tipo="atencao">
              Cobertura incompleta. As leis municipais foram levantadas em fonte secundária e os
              feriados municipais eventuais, decretados ano a ano, não estão cobertos. Confirmar
              antes da produção.
            </Aviso>
          </Cartao>
        )}

        <Cartao titulo="Demonstração">
          <div className="pilha-sm">
            <p className="txt-sec" style={{ fontSize: 13 }}>
              Os dados ficam salvos apenas neste navegador, separados por operação. Isso serve à
              demonstração e não representa segurança nem isolamento de produção.
            </p>
            {confirmando ? (
              <>
                <Aviso tipo="atencao">
                  Isto apaga as alterações de {operacao.nome} e recria o cenário inicial.
                </Aviso>
                <div className="grade-2">
                  <button
                    type="button"
                    className="btn btn--secundario"
                    onClick={() => setConfirmando(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn--primario"
                    onClick={() => {
                      restaurarDemonstracao('operacao')
                      setConfirmando(false)
                    }}
                  >
                    Restaurar
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--secundario btn--bloco"
                onClick={() => setConfirmando(true)}
              >
                <IconeRestaurar tamanho={16} />
                Restaurar demonstração desta operação
              </button>
            )}
            <p className="txt-peq">
              <IconeAjustes tamanho={12} /> Para trocar de perfil, de operação ou de data, use
              “Ajustar demo” na faixa superior.
            </p>
            <p className="txt-peq">
              <IconeUsuario tamanho={12} /> Perfil atual:{' '}
              {ehProprietario ? 'Proprietário' : 'Assistente'}.
            </p>
          </div>
        </Cartao>
      </div>
    </>
  )
}
