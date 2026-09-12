import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../state/loja'
import { useAuth } from '../../state/AuthContext'
import { Cabecalho } from '../components/Layout'
import { Aviso, Campo, Cartao, LinhaDado } from '../components/Base'
import {
  IconeAdicionar,
  IconeAjustes,
  IconeCalendario,
  IconeContratos,
  IconeRestaurar,
  IconeSeta,
  IconeUsuario,
} from '../components/Icones'
import { REGRAS_FERIADO, feriadosDoAno } from '../../domain/feriados'
import { formatarData, partes } from '../../domain/dates'
import { classificar, criarConvite, listarMembros, revogarMembro, type Membro } from '../../data/api'
import { urlDeRetorno } from '../../lib/supabase'

export function Mais() {
  const {
    operacao,
    usuario,
    ehProprietario,
    estado,
    dataReferencia,
    definirFeriadosAtivos,
    demo,
  } = useApp()
  const [confirmando, setConfirmando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const ano = partes(dataReferencia || `${new Date().getFullYear()}-01-01`).ano
  const ativos = estado.config.feriadosAtivos
  const doAno = feriadosDoAno(ano, ativos)

  async function alternar(id: string) {
    const proximo = ativos.includes(id) ? ativos.filter((x) => x !== id) : [...ativos, id]
    setFalha(null)
    try {
      await definirFeriadosAtivos(proximo)
    } catch (e) {
      setFalha(classificar(e).message)
    }
  }

  return (
    <>
      <Cabecalho titulo="Mais" subtitulo={`${operacao.nome} · ${usuario.nome}`} />

      <div className="pilha">
        <Cartao titulo="Operação">
          <div className="dados">
            <LinhaDado rotulo="Nome" valor={operacao.nome} forte />
            <LinhaDado rotulo="Cidade de referência" valor={operacao.cidade} />
            <LinhaDado rotulo="Fuso das datas" valor={operacao.fuso} />
            <LinhaDado rotulo="Seu papel" valor={ehProprietario ? 'Proprietário' : 'Assistente'} />
            <LinhaDado rotulo="Clientes" valor={String(estado.clientes.length)} />
            {ehProprietario && (
              <LinhaDado rotulo="Contratos" valor={String(estado.contratos.length)} />
            )}
          </div>
          <p className="txt-peq" style={{ marginTop: 10 }}>
            Cada operação tem conta e dados próprios. Nada é compartilhado entre operações.
          </p>
        </Cartao>

        {demo ? <EquipeDemo /> : <Equipe operacaoId={operacao.id} ehProprietario={ehProprietario} />}

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
              pulados na geração dos vencimentos. A mudança vale para contratos NOVOS: os
              existentes guardam o próprio calendário e não são recalculados.
            </p>
            {falha && <Aviso tipo="erro">{falha}</Aviso>}
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
                      onChange={() => void alternar(r.id)}
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
              antes do uso real.
            </Aviso>
          </Cartao>
        )}

        {demo ? (
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
                        demo.restaurar('operacao')
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
            </div>
          </Cartao>
        ) : (
          <Conta />
        )}
      </div>
    </>
  )
}

/** Equipe no modo integrado: convidar e revogar assistentes. */
function Equipe({ operacaoId, ehProprietario }: { operacaoId: string; ehProprietario: boolean }) {
  const [membros, setMembros] = useState<Membro[]>([])
  const [email, setEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setMembros(await listarMembros(operacaoId))
    } catch (e) {
      setFalha(classificar(e).message)
    }
  }, [operacaoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function convidar() {
    if (ocupado || !email.includes('@')) return
    setOcupado(true)
    setFalha(null)
    setToken(null)
    try {
      setToken(await criarConvite(operacaoId, email.trim()))
      setEmail('')
      await carregar()
    } catch (e) {
      setFalha(classificar(e).message)
    } finally {
      setOcupado(false)
    }
  }

  async function revogar(usuarioId: string) {
    setOcupado(true)
    setFalha(null)
    try {
      await revogarMembro(operacaoId, usuarioId)
      await carregar()
    } catch (e) {
      setFalha(classificar(e).message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Cartao titulo="Equipe">
      <div className="pilha-sm">
        {membros.map((m) => (
          <div key={m.usuarioId} className="linha" style={{ gap: 10 }}>
            <span className="avatar" aria-hidden>
              {m.nome.charAt(0).toUpperCase()}
            </span>
            <div className="crescer">
              <div className="txt-forte">{m.nome}</div>
              <div className="txt-peq">
                {m.papel === 'proprietario' ? 'Proprietário' : 'Assistente'} · {m.email}
              </div>
            </div>
            {m.ativo ? (
              m.papel === 'assistente' && ehProprietario ? (
                <button
                  type="button"
                  className="btn btn--perigo btn--pequeno"
                  disabled={ocupado}
                  onClick={() => void revogar(m.usuarioId)}
                >
                  Revogar
                </button>
              ) : (
                <span className="etiqueta etiqueta--paga">Ativo</span>
              )
            ) : (
              <span className="etiqueta etiqueta--neutra">Revogado</span>
            )}
          </div>
        ))}

        {falha && <Aviso tipo="erro">{falha}</Aviso>}

        {ehProprietario && (
          <>
            <div className="divisor" />
            <Campo
              rotulo="Convidar assistente"
              htmlFor="email-convite"
              dica="O convite vale por 7 dias e só pode ser aceito por quem tiver esse e-mail."
            >
              <input
                id="email-convite"
                type="email"
                className="entrada"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
            <button
              type="button"
              className="btn btn--secundario btn--bloco"
              onClick={() => void convidar()}
              disabled={ocupado || !email.includes('@')}
            >
              <IconeAdicionar tamanho={16} />
              {ocupado ? 'Gerando…' : 'Gerar convite'}
            </button>

            {token && (
              <Aviso tipo="positivo">
                Convite criado. Envie este link para a pessoa — ele aparece uma única vez:
                <code className="chave-totp" style={{ marginTop: 8 }}>
                  {urlDeRetorno(`/?convite=${token}`)}
                </code>
                Nada é enviado automaticamente por aqui.
              </Aviso>
            )}
          </>
        )}

        <p className="txt-sec" style={{ fontSize: 13 }}>
          O assistente cadastra clientes, consulta o que precisa para cobrar e registra pagamentos.
          Não vê indicadores gerais, não cria contratos, não altera regras financeiras e não desfaz
          pagamentos. Permissões iniciais, a validar.
        </p>
      </div>
    </Cartao>
  )
}

/** Equipe no modo demonstração: apenas apresentação dos perfis fictícios. */
function EquipeDemo() {
  const { membros } = useApp()
  return (
    <Cartao titulo="Acesso do assistente">
      <div className="pilha-sm">
        {membros
          .filter((m) => m.perfil === 'assistente')
          .map((a) => (
            <div key={a.id} className="linha" style={{ gap: 10 }}>
              <span className="avatar" aria-hidden>
                {a.nome.charAt(0)}
              </span>
              <div className="crescer">
                <div className="txt-forte">{a.nome}</div>
                <div className="txt-peq">Assistente</div>
              </div>
              <span className="etiqueta etiqueta--neutra">Ativo</span>
            </div>
          ))}
        <div className="divisor" />
        <p className="txt-sec" style={{ fontSize: 13 }}>
          O assistente cadastra clientes, consulta o que precisa para cobrar e registra pagamentos.
          Não vê indicadores gerais, não cria contratos, não altera regras financeiras e não desfaz
          pagamentos.
        </p>
        <Aviso>Convite de assistente não é enviado nesta demonstração.</Aviso>
      </div>
    </Cartao>
  )
}

/** Conta do usuário no modo integrado. */
function Conta() {
  const { usuario, sair } = useAuth()
  return (
    <Cartao titulo="Conta">
      <div className="pilha-sm">
        <div className="dados">
          <LinhaDado rotulo="E-mail" valor={usuario?.email ?? '—'} />
          <LinhaDado rotulo="Verificação em duas etapas" valor="Ativa" />
        </div>
        <p className="txt-peq">
          <IconeUsuario tamanho={12} /> A verificação em duas etapas é exigida pelo servidor: sem
          ela, nenhum dado da operação é liberado.
        </p>
        <button type="button" className="btn btn--secundario btn--bloco" onClick={() => void sair()}>
          Sair da conta
        </button>
      </div>
    </Cartao>
  )
}
