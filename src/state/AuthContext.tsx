import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, urlDeRetorno } from '../lib/supabase'
import { carregarVinculo, classificar, provisionarProprietario, type Vinculo } from '../data/api'

/**
 * Sessão, verificação em duas etapas e vínculo com a operação.
 *
 * O bloqueio de acesso aos dados está no banco (políticas exigem `aal2`). O que
 * este contexto faz é evitar que a pessoa fique batendo numa porta fechada:
 * leva ao passo que falta — confirmar e-mail, cadastrar o segundo fator,
 * informar o código, ou criar a operação.
 */

export type EstagioSessao =
  | 'carregando'
  | 'deslogado'
  // Autenticado em aal1 e ainda sem nenhum fator verificado: precisa cadastrar.
  | 'cadastrar_segundo_fator'
  // Já tem fator verificado, mas esta sessão está em aal1: precisa do código.
  | 'informar_segundo_fator'
  // aal2 atingido, mas sem operação: proprietário novo provisiona a dele.
  | 'sem_operacao'
  | 'pronto'

export interface FatorTotp {
  id: string
  qrCode: string
  segredo: string
  uri: string
}

interface AuthContextValor {
  estagio: EstagioSessao
  sessao: Session | null
  usuario: User | null
  vinculo: Vinculo | null
  erro: string | null
  limparErro: () => void

  cadastrar: (dados: { nome: string; email: string; senha: string }) => Promise<{ confirmar: boolean }>
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => Promise<void>
  pedirRedefinicao: (email: string) => Promise<void>
  redefinirSenha: (novaSenha: string) => Promise<void>

  iniciarCadastroTotp: () => Promise<FatorTotp>
  concluirCadastroTotp: (fatorId: string, codigo: string) => Promise<void>
  informarCodigoTotp: (codigo: string) => Promise<void>

  provisionarOperacao: (nome: string) => Promise<void>
  recarregarVinculo: () => Promise<void>
}

const Ctx = createContext<AuthContextValor | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [estagio, setEstagio] = useState<EstagioSessao>('carregando')
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [redefinindo, setRedefinindo] = useState(false)

  const avaliar = useCallback(async (sessaoAtual: Session | null) => {
    if (!sessaoAtual) {
      setVinculo(null)
      setEstagio('deslogado')
      return
    }

    const { data: nivel, error } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      setErro(classificar(error).message)
      setEstagio('deslogado')
      return
    }

    // `nextLevel === 'aal1'` significa que não há fator verificado. Como o banco
    // exige aal2 para qualquer dado da operação, o cadastro do fator é o passo
    // seguinte obrigatório.
    if (nivel.nextLevel !== 'aal2') {
      setVinculo(null)
      setEstagio('cadastrar_segundo_fator')
      return
    }
    if (nivel.currentLevel !== 'aal2') {
      setVinculo(null)
      setEstagio('informar_segundo_fator')
      return
    }

    try {
      const encontrado = await carregarVinculo()
      setVinculo(encontrado)
      setEstagio(encontrado ? 'pronto' : 'sem_operacao')
    } catch (e) {
      setErro(classificar(e).message)
      setVinculo(null)
      setEstagio('sem_operacao')
    }
  }, [])

  useEffect(() => {
    let ativo = true

    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!ativo) return
        setSessao(data.session)
        return avaliar(data.session)
      })
      .catch((e) => {
        if (!ativo) return
        setErro(classificar(e).message)
        setEstagio('deslogado')
      })

    const { data: assinatura } = supabase().auth.onAuthStateChange((evento, novaSessao) => {
      if (!ativo) return
      setSessao(novaSessao)
      // Chegando pelo link de redefinição, a tela de nova senha tem prioridade.
      if (evento === 'PASSWORD_RECOVERY') {
        setRedefinindo(true)
        return
      }
      void avaliar(novaSessao)
    })

    return () => {
      ativo = false
      assinatura.subscription.unsubscribe()
    }
  }, [avaliar])

  const cadastrar = useCallback(
    async (dados: { nome: string; email: string; senha: string }) => {
      setErro(null)
      const { data, error } = await supabase().auth.signUp({
        email: dados.email.trim(),
        password: dados.senha,
        options: {
          data: { nome: dados.nome.trim() },
          emailRedirectTo: urlDeRetorno('/entrar'),
        },
      })
      if (error) throw classificar(error)
      // Sem sessão na resposta = o projeto exige confirmação por e-mail.
      return { confirmar: !data.session }
    },
    [],
  )

  const entrar = useCallback(async (email: string, senha: string) => {
    setErro(null)
    const { error } = await supabase().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })
    if (error) throw classificar(error)
  }, [])

  const sair = useCallback(async () => {
    await supabase().auth.signOut()
    setVinculo(null)
    setEstagio('deslogado')
  }, [])

  const pedirRedefinicao = useCallback(async (email: string) => {
    setErro(null)
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: urlDeRetorno('/redefinir-senha'),
    })
    if (error) throw classificar(error)
  }, [])

  const redefinirSenha = useCallback(async (novaSenha: string) => {
    setErro(null)
    const { error } = await supabase().auth.updateUser({ password: novaSenha })
    if (error) throw classificar(error)
    setRedefinindo(false)
    const { data } = await supabase().auth.getSession()
    await avaliar(data.session)
  }, [avaliar])

  const iniciarCadastroTotp = useCallback(async (): Promise<FatorTotp> => {
    setErro(null)
    // Fatores não verificados de tentativas anteriores atrapalham o nome único.
    const { data: lista } = await supabase().auth.mfa.listFactors()
    for (const fator of lista?.all ?? []) {
      if (fator.status !== 'verified') {
        await supabase().auth.mfa.unenroll({ factorId: fator.id })
      }
    }

    const { data, error } = await supabase().auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Aplicativo ${new Date().toISOString().slice(0, 10)}`,
    })
    if (error) throw classificar(error)
    const totp = (data as { id: string; totp: { qr_code: string; secret: string; uri: string } })
    return {
      id: totp.id,
      qrCode: totp.totp.qr_code,
      segredo: totp.totp.secret,
      uri: totp.totp.uri,
    }
  }, [])

  const concluirCadastroTotp = useCallback(
    async (fatorId: string, codigo: string) => {
      setErro(null)
      const { error } = await supabase().auth.mfa.challengeAndVerify({
        factorId: fatorId,
        code: codigo.replace(/\s/g, ''),
      })
      if (error) throw classificar(error)
      const { data } = await supabase().auth.getSession()
      await avaliar(data.session)
    },
    [avaliar],
  )

  const informarCodigoTotp = useCallback(
    async (codigo: string) => {
      setErro(null)
      const { data: lista, error: erroLista } = await supabase().auth.mfa.listFactors()
      if (erroLista) throw classificar(erroLista)
      const fator = lista.totp?.[0]
      if (!fator) throw new Error('Nenhum aplicativo autenticador cadastrado nesta conta.')

      const { error } = await supabase().auth.mfa.challengeAndVerify({
        factorId: fator.id,
        code: codigo.replace(/\s/g, ''),
      })
      if (error) throw classificar(error)
      const { data } = await supabase().auth.getSession()
      await avaliar(data.session)
    },
    [avaliar],
  )

  const recarregarVinculo = useCallback(async () => {
    const { data } = await supabase().auth.getSession()
    await avaliar(data.session)
  }, [avaliar])

  const provisionarOperacao = useCallback(
    async (nome: string) => {
      setErro(null)
      await provisionarProprietario(nome)
      await recarregarVinculo()
    },
    [recarregarVinculo],
  )

  const valor = useMemo<AuthContextValor>(
    () => ({
      estagio: redefinindo ? 'deslogado' : estagio,
      sessao,
      usuario: sessao?.user ?? null,
      vinculo,
      erro,
      limparErro: () => setErro(null),
      cadastrar,
      entrar,
      sair,
      pedirRedefinicao,
      redefinirSenha,
      iniciarCadastroTotp,
      concluirCadastroTotp,
      informarCodigoTotp,
      provisionarOperacao,
      recarregarVinculo,
    }),
    [
      redefinindo, estagio, sessao, vinculo, erro, cadastrar, entrar, sair, pedirRedefinicao,
      redefinirSenha, iniciarCadastroTotp, concluirCadastroTotp, informarCodigoTotp,
      provisionarOperacao, recarregarVinculo,
    ],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): AuthContextValor {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return ctx
}
