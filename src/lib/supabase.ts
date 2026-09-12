import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente do Supabase.
 *
 * Só entram aqui valores públicos: a URL do projeto e a chave anônima
 * (publishable). Chave de serviço e segredos administrativos NUNCA podem chegar
 * ao bundle do navegador — o que precisa deles roda no servidor.
 *
 * A sessão é guardada pelo próprio SDK. `localStorage` é armazenamento de
 * SESSÃO, não de dados da operação: nada financeiro é lido ou escrito lá.
 */

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined
const CHAVE_ANONIMA = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const MODO_DEMO = import.meta.env.VITE_MODO === 'demo'

export const supabaseConfigurado = Boolean(URL_SUPABASE && CHAVE_ANONIMA)

let cliente: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!cliente) {
    if (!supabaseConfigurado) {
      throw new Error(
        'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY ' +
          'em .env.local (veja .env.example).',
      )
    }
    cliente = createClient(URL_SUPABASE!, CHAVE_ANONIMA!, {
      auth: {
        // PKCE é o fluxo indicado para aplicações que rodam no navegador.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // Necessário para concluir confirmação de e-mail e redefinição de senha
        // ao voltar pelo link — inclusive no Safari do iPhone.
        detectSessionInUrl: true,
      },
    })
  }
  return cliente
}

/** URL de retorno dos links de autenticação, por ambiente. */
export function urlDeRetorno(caminho: string): string {
  const base = (import.meta.env.VITE_URL_APLICACAO as string | undefined) ?? window.location.origin
  return `${base.replace(/\/$/, '')}/#${caminho}`
}
