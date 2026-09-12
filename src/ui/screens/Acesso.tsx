import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../../state/AuthContext'
import { aceitarConvite, classificar } from '../../data/api'
import { Aviso, Campo } from '../components/Base'
import { IconeCheck, IconeUsuario } from '../components/Icones'

/**
 * Telas de acesso: cadastro, login, recuperação de senha, verificação em duas
 * etapas, criação da operação e aceite de convite.
 *
 * A interface conduz ao passo que falta, mas não é ela que protege nada: o
 * banco recusa qualquer dado de operação antes de `aal2` e sem vínculo ativo.
 */

function Moldura({
  titulo,
  descricao,
  children,
  rodape,
}: {
  titulo: string
  descricao?: string
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <div className="acesso">
      <div className="acesso__caixa">
        <div className="acesso__marca">
          <span className="acesso__marca-icone" aria-hidden>
            <IconeUsuario tamanho={18} />
          </span>
          Acordos
        </div>
        <h1 className="acesso__titulo">{titulo}</h1>
        {descricao && <p className="acesso__descricao">{descricao}</p>}
        {children}
        {rodape && <div className="acesso__rodape">{rodape}</div>}
      </div>
    </div>
  )
}

function useEnvio() {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const enviar = async (acao: () => Promise<void>) => {
    if (enviando) return
    setEnviando(true)
    setErro(null)
    try {
      await acao()
    } catch (e) {
      setErro(classificar(e).message)
    } finally {
      setEnviando(false)
    }
  }
  return { enviando, erro, setErro, aviso, setAviso, enviar }
}

// -----------------------------------------------------------------------------

export function Entrar({ irPara }: { irPara: (tela: TelaAcesso) => void }) {
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const { enviando, erro, enviar } = useEnvio()

  function submeter(e: FormEvent) {
    e.preventDefault()
    void enviar(() => entrar(email, senha))
  }

  return (
    <Moldura
      titulo="Entrar"
      descricao="Use o e-mail e a senha da sua conta."
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={() => irPara('recuperar')}>
            Esqueci a senha
          </button>
          <button type="button" className="btn btn--fantasma" onClick={() => irPara('cadastrar')}>
            Criar conta
          </button>
        </>
      }
    >
      <form className="pilha" onSubmit={submeter} noValidate>
        <Campo rotulo="E-mail" htmlFor="email">
          <input
            id="email"
            type="email"
            className="entrada"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Senha" htmlFor="senha">
          <input
            id="senha"
            type="password"
            className="entrada"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button type="submit" className="btn btn--primario btn--bloco" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </Moldura>
  )
}

export function Cadastrar({ irPara }: { irPara: (tela: TelaAcesso) => void }) {
  const { cadastrar } = useAuth()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const { enviando, erro, enviar } = useEnvio()

  function submeter(e: FormEvent) {
    e.preventDefault()
    if (senha.length < 8) return
    void enviar(async () => {
      const { confirmar } = await cadastrar({ nome, email, senha })
      if (confirmar) setConfirmado(true)
    })
  }

  if (confirmado) {
    return (
      <Moldura
        titulo="Confirme seu e-mail"
        descricao={`Enviamos um link para ${email}. Abra o link para ativar a conta e depois entre.`}
        rodape={
          <button type="button" className="btn btn--fantasma" onClick={() => irPara('entrar')}>
            Já confirmei — entrar
          </button>
        }
      >
        <Aviso tipo="positivo">
          O link chega em alguns minutos. Se não chegar, confira a caixa de spam.
        </Aviso>
      </Moldura>
    )
  }

  return (
    <Moldura
      titulo="Criar conta"
      descricao="Sua operação é independente. Nada é compartilhado com outras contas."
      rodape={
        <button type="button" className="btn btn--fantasma" onClick={() => irPara('entrar')}>
          Já tenho conta
        </button>
      }
    >
      <form className="pilha" onSubmit={submeter} noValidate>
        <Campo rotulo="Seu nome" htmlFor="nome">
          <input
            id="nome"
            className="entrada"
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </Campo>
        <Campo rotulo="E-mail" htmlFor="email-cadastro">
          <input
            id="email-cadastro"
            type="email"
            className="entrada"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Senha"
          htmlFor="senha-cadastro"
          dica="Ao menos 8 caracteres."
          erro={senha.length > 0 && senha.length < 8 ? 'Senha curta demais.' : null}
        >
          <input
            id="senha-cadastro"
            type="password"
            className="entrada"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button type="submit" className="btn btn--primario btn--bloco" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
    </Moldura>
  )
}

export function RecuperarSenha({ irPara }: { irPara: (tela: TelaAcesso) => void }) {
  const { pedirRedefinicao } = useAuth()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const { enviando, erro, enviar } = useEnvio()

  return (
    <Moldura
      titulo="Recuperar senha"
      descricao="Enviamos um link para você definir uma nova senha."
      rodape={
        <button type="button" className="btn btn--fantasma" onClick={() => irPara('entrar')}>
          Voltar para entrar
        </button>
      }
    >
      {enviado ? (
        <Aviso tipo="positivo">
          Se existir uma conta com {email}, o link chega em alguns minutos.
        </Aviso>
      ) : (
        <form
          className="pilha"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(async () => {
              await pedirRedefinicao(email)
              setEnviado(true)
            })
          }}
          noValidate
        >
          <Campo rotulo="E-mail" htmlFor="email-recuperar">
            <input
              id="email-recuperar"
              type="email"
              className="entrada"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button type="submit" className="btn btn--primario btn--bloco" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar link'}
          </button>
        </form>
      )}
    </Moldura>
  )
}

export function RedefinirSenha() {
  const { redefinirSenha } = useAuth()
  const [senha, setSenha] = useState('')
  const { enviando, erro, enviar } = useEnvio()

  return (
    <Moldura titulo="Nova senha" descricao="Escolha a senha que você vai usar a partir de agora.">
      <form
        className="pilha"
        onSubmit={(e) => {
          e.preventDefault()
          if (senha.length < 8) return
          void enviar(() => redefinirSenha(senha))
        }}
        noValidate
      >
        <Campo rotulo="Nova senha" htmlFor="senha-nova" dica="Ao menos 8 caracteres.">
          <input
            id="senha-nova"
            type="password"
            className="entrada"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button type="submit" className="btn btn--primario btn--bloco" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar senha'}
        </button>
      </form>
    </Moldura>
  )
}

// -----------------------------------------------------------------------------
// Verificação em duas etapas
// -----------------------------------------------------------------------------

export function CadastrarSegundoFator() {
  const { iniciarCadastroTotp, concluirCadastroTotp, sair } = useAuth()
  const [fator, setFator] = useState<{ id: string; qrCode: string; segredo: string } | null>(null)
  const [codigo, setCodigo] = useState('')
  const { enviando, erro, setErro, enviar } = useEnvio()
  const [iniciando, setIniciando] = useState(true)

  useEffect(() => {
    let ativo = true
    iniciarCadastroTotp()
      .then((f) => {
        if (ativo) setFator(f)
      })
      .catch((e) => {
        if (ativo) setErro(classificar(e).message)
      })
      .finally(() => {
        if (ativo) setIniciando(false)
      })
    return () => {
      ativo = false
    }
  }, [iniciarCadastroTotp, setErro])

  return (
    <Moldura
      titulo="Proteger a conta"
      descricao="Antes de usar os dados da operação, cadastre um aplicativo autenticador."
      rodape={
        <button type="button" className="btn btn--fantasma" onClick={() => void sair()}>
          Sair
        </button>
      }
    >
      <div className="pilha">
        <Aviso>
          Instale um aplicativo autenticador (Google Authenticator, Authy, 1Password ou o próprio
          app de senhas do iPhone), leia o código abaixo e informe os seis dígitos.
        </Aviso>

        {iniciando && <p className="txt-sec">Gerando o código…</p>}

        {fator && (
          <>
            <div className="qr">
              <img src={`data:image/svg+xml;utf-8,${encodeURIComponent(fator.qrCode)}`} alt="QR Code para o aplicativo autenticador" />
            </div>
            <Campo
              rotulo="Não consegue ler o código?"
              dica="Digite esta chave manualmente no aplicativo."
            >
              <code className="chave-totp">{fator.segredo}</code>
            </Campo>
          </>
        )}

        <form
          className="pilha"
          onSubmit={(e) => {
            e.preventDefault()
            if (!fator) return
            void enviar(() => concluirCadastroTotp(fator.id, codigo))
          }}
        >
          <Campo rotulo="Código de seis dígitos" htmlFor="codigo-totp">
            <input
              id="codigo-totp"
              className="entrada entrada--codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button
            type="submit"
            className="btn btn--primario btn--bloco"
            disabled={enviando || !fator || codigo.length < 6}
          >
            {enviando ? 'Verificando…' : 'Concluir verificação'}
          </button>
        </form>

        <Aviso tipo="atencao">
          Guarde o acesso ao aplicativo autenticador. Perdendo o aparelho, a recuperação depende do
          procedimento descrito em “Recuperação de acesso” na documentação do projeto.
        </Aviso>
      </div>
    </Moldura>
  )
}

export function InformarSegundoFator() {
  const { informarCodigoTotp, sair } = useAuth()
  const [codigo, setCodigo] = useState('')
  const { enviando, erro, enviar } = useEnvio()

  return (
    <Moldura
      titulo="Código de verificação"
      descricao="Abra seu aplicativo autenticador e informe os seis dígitos."
      rodape={
        <button type="button" className="btn btn--fantasma" onClick={() => void sair()}>
          Sair
        </button>
      }
    >
      <form
        className="pilha"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar(() => informarCodigoTotp(codigo))
        }}
      >
        <Campo rotulo="Código" htmlFor="codigo-login">
          <input
            id="codigo-login"
            className="entrada entrada--codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        </Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button
          type="submit"
          className="btn btn--primario btn--bloco"
          disabled={enviando || codigo.length < 6}
        >
          {enviando ? 'Verificando…' : 'Continuar'}
        </button>
      </form>
    </Moldura>
  )
}

// -----------------------------------------------------------------------------
// Primeiro acesso: criar a operação ou aceitar um convite
// -----------------------------------------------------------------------------

export function PrimeiroAcesso() {
  const { provisionarOperacao, recarregarVinculo, sair, usuario } = useAuth()
  const [nome, setNome] = useState('')
  const [token, setToken] = useState(() => {
    const hash = window.location.hash
    const marca = hash.indexOf('convite=')
    return marca >= 0 ? hash.slice(marca + 8) : ''
  })
  const { enviando, erro, enviar } = useEnvio()
  const [modo, setModo] = useState<'criar' | 'convite'>(() =>
    window.location.hash.includes('convite=') ? 'convite' : 'criar',
  )

  return (
    <Moldura
      titulo="Primeiro acesso"
      descricao={`Entrando como ${usuario?.email ?? ''}.`}
      rodape={
        <button type="button" className="btn btn--fantasma" onClick={() => void sair()}>
          Sair
        </button>
      }
    >
      <div className="pilha">
        <div className="seletor-segmentado" role="group" aria-label="Tipo de acesso">
          <button type="button" aria-pressed={modo === 'criar'} onClick={() => setModo('criar')}>
            Criar operação
          </button>
          <button
            type="button"
            aria-pressed={modo === 'convite'}
            onClick={() => setModo('convite')}
          >
            Tenho um convite
          </button>
        </div>

        {modo === 'criar' ? (
          <form
            className="pilha"
            onSubmit={(e) => {
              e.preventDefault()
              void enviar(() => provisionarOperacao(nome))
            }}
          >
            <Campo
              rotulo="Nome da operação"
              htmlFor="nome-operacao"
              dica="A operação começa vazia. Nenhum dado de exemplo é criado."
            >
              <input
                id="nome-operacao"
                className="entrada"
                placeholder="Minha operação"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Campo>
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <button type="submit" className="btn btn--primario btn--bloco" disabled={enviando}>
              {enviando ? 'Criando…' : 'Criar operação'}
            </button>
          </form>
        ) : (
          <form
            className="pilha"
            onSubmit={(e) => {
              e.preventDefault()
              void enviar(async () => {
                await aceitarConvite(token.trim())
                await recarregarVinculo()
              })
            }}
          >
            <Campo
              rotulo="Código do convite"
              htmlFor="token-convite"
              dica="O proprietário da operação envia este código para você."
            >
              <input
                id="token-convite"
                className="entrada"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Campo>
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <button
              type="submit"
              className="btn btn--primario btn--bloco"
              disabled={enviando || token.trim().length < 8}
            >
              <IconeCheck tamanho={16} />
              {enviando ? 'Entrando…' : 'Aceitar convite'}
            </button>
          </form>
        )}
      </div>
    </Moldura>
  )
}

export type TelaAcesso = 'entrar' | 'cadastrar' | 'recuperar'
