import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { MODO_DEMO, supabaseConfigurado } from './lib/supabase'
import { AuthProvider } from './state/AuthContext'
import { DemoProvider } from './state/DemoProvider'
import { Portao } from './ui/Portao'
import { App } from './App'
import './styles.css'

/**
 * Dois modos, escolhidos por variável de ambiente:
 *
 * - `VITE_MODO=demo` — protótipo com dados fictícios no navegador. Sem login,
 *   com painel de demonstração. É o que se mostra ao cliente.
 * - padrão — aplicação integrada ao Supabase, com login, verificação em duas
 *   etapas e dados reais da operação.
 */

function Raiz() {
  if (MODO_DEMO) {
    return (
      <DemoProvider>
        <App />
      </DemoProvider>
    )
  }

  if (!supabaseConfigurado) {
    return (
      <div className="acesso">
        <div className="acesso__caixa">
          <h1 className="acesso__titulo">Configuração faltando</h1>
          <p className="acesso__descricao">
            Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> em{' '}
            <code>.env.local</code> (veja <code>.env.example</code>) e recarregue a página.
          </p>
          <p className="acesso__descricao">
            Para abrir a demonstração com dados fictícios, rode <code>npm run dev:demo</code>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <Portao />
    </AuthProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Raiz />
    </HashRouter>
  </StrictMode>,
)
