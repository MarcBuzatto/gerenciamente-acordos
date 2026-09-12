import { useState } from 'react'
import { useAuth } from '../state/AuthContext'
import { SupabaseProvider } from '../state/SupabaseProvider'
import { App } from '../App'
import {
  Cadastrar,
  CadastrarSegundoFator,
  Entrar,
  InformarSegundoFator,
  PrimeiroAcesso,
  RecuperarSenha,
  RedefinirSenha,
  type TelaAcesso,
} from './screens/Acesso'

/**
 * Decide o que mostrar conforme o estágio da sessão.
 *
 * É conveniência de navegação, não segurança: mesmo que alguém contorne esta
 * tela, o banco recusa dados de operação sem `aal2` e sem vínculo ativo.
 */
export function Portao() {
  const { estagio } = useAuth()
  const [tela, setTela] = useState<TelaAcesso>('entrar')
  const redefinindo = window.location.hash.startsWith('#/redefinir-senha')

  if (estagio === 'carregando') {
    return (
      <div className="acesso">
        <div className="acesso__caixa" role="status" aria-live="polite">
          <p className="txt-sec">Carregando…</p>
        </div>
      </div>
    )
  }

  if (redefinindo) return <RedefinirSenha />

  if (estagio === 'deslogado') {
    if (tela === 'cadastrar') return <Cadastrar irPara={setTela} />
    if (tela === 'recuperar') return <RecuperarSenha irPara={setTela} />
    return <Entrar irPara={setTela} />
  }

  if (estagio === 'cadastrar_segundo_fator') return <CadastrarSegundoFator />
  if (estagio === 'informar_segundo_fator') return <InformarSegundoFator />
  if (estagio === 'sem_operacao') return <PrimeiroAcesso />

  return (
    <SupabaseProvider>
      <App />
    </SupabaseProvider>
  )
}
