import { Client, type ClientConfig } from 'pg'

/**
 * Apoio dos testes de integração com o banco.
 *
 * Cada "identidade" abre uma conexão que assume o papel `authenticated` e
 * publica as claims do JWT na GUC `request.jwt.claims`, exatamente como o
 * PostgREST faz ao atender uma requisição do Supabase. Assim as políticas de
 * RLS e as funções SECURITY DEFINER são exercitadas do mesmo jeito que em
 * produção — inclusive para chamadas diretas à API, não só pela interface.
 */

export const URL_BANCO =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres@localhost/acordos_test?host=/tmp&port=55432'

export async function bancoDisponivel(): Promise<boolean> {
  const cliente = new Client(configuracao())
  try {
    await cliente.connect()
    await cliente.query('select 1')
    return true
  } catch {
    return false
  } finally {
    await cliente.end().catch(() => undefined)
  }
}

function configuracao(): ClientConfig {
  return { connectionString: URL_BANCO }
}

export interface Claims {
  sub: string
  email: string
  /** Nível de garantia da sessão. `aal1` = sem segundo fator verificado. */
  aal?: 'aal1' | 'aal2'
}

export class Sessao {
  private constructor(
    readonly cliente: Client,
    readonly papel: 'anon' | 'authenticated' | 'service_role',
    readonly claims: Claims | null,
  ) {}

  static async abrir(
    papel: 'anon' | 'authenticated' | 'service_role',
    claims: Claims | null = null,
  ): Promise<Sessao> {
    const cliente = new Client(configuracao())
    await cliente.connect()
    return new Sessao(cliente, papel, claims)
  }

  /** Executa numa transação com o papel e as claims desta identidade. */
  async consultar<T = Record<string, unknown>>(
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T[]> {
    await this.cliente.query('begin')
    try {
      if (this.claims) {
        await this.cliente.query('select set_config($1, $2, true)', [
          'request.jwt.claims',
          JSON.stringify({ aal: 'aal2', ...this.claims }),
        ])
      }
      await this.cliente.query(`set local role ${this.papel}`)
      const resultado = await this.cliente.query(sql, parametros)
      await this.cliente.query('commit')
      return resultado.rows as T[]
    } catch (erro) {
      await this.cliente.query('rollback').catch(() => undefined)
      throw erro
    }
  }

  /**
   * Espera que a escrita não atinja nenhuma linha. A RLS não levanta erro num
   * UPDATE ou DELETE que não casa com política: ela simplesmente esconde as
   * linhas, e a instrução afeta zero registros.
   */
  async semEfeito(sql: string, parametros: unknown[] = []): Promise<void> {
    await this.cliente.query('begin')
    try {
      if (this.claims) {
        await this.cliente.query('select set_config($1, $2, true)', [
          'request.jwt.claims',
          JSON.stringify({ aal: 'aal2', ...this.claims }),
        ])
      }
      await this.cliente.query(`set local role ${this.papel}`)
      const resultado = await this.cliente.query(sql, parametros)
      await this.cliente.query('commit')
      if ((resultado.rowCount ?? 0) > 0) {
        throw new Error(`Esperava nenhuma linha afetada, mas foram ${resultado.rowCount}.`)
      }
    } catch (erro) {
      await this.cliente.query('rollback').catch(() => undefined)
      // Recusa explícita do banco também satisfaz "não teve efeito".
      if ((erro as Error).message.startsWith('Esperava nenhuma linha')) throw erro
    }
  }

  /** Espera que a chamada seja recusada e devolve a mensagem do banco. */
  async recusa(sql: string, parametros: unknown[] = []): Promise<string> {
    try {
      await this.consultar(sql, parametros)
    } catch (erro) {
      return (erro as Error).message
    }
    throw new Error(`Esperava recusa, mas a chamada foi aceita: ${sql.slice(0, 120)}`)
  }

  async fechar(): Promise<void> {
    await this.cliente.end().catch(() => undefined)
  }
}

/** Conexão administrativa: prepara usuários de teste fora das políticas. */
export async function comAdmin<T>(acao: (c: Client) => Promise<T>): Promise<T> {
  const cliente = new Client(configuracao())
  await cliente.connect()
  try {
    return await acao(cliente)
  } finally {
    await cliente.end().catch(() => undefined)
  }
}

export async function criarUsuario(email: string, nome: string): Promise<string> {
  return comAdmin(async (c) => {
    const { rows } = await c.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('nome', $2::text))
       on conflict (email) do update set raw_user_meta_data = excluded.raw_user_meta_data
       returning id`,
      [email, nome],
    )
    return rows[0].id as string
  })
}

/** Limpa os dados da aplicação entre os testes, preservando o esquema. */
export async function limparDados(): Promise<void> {
  await comAdmin(async (c) => {
    await c.query(`
      set session_replication_role = replica;
      truncate table
        public.auditoria, public.estornos_pagamento, public.alocacoes_pagamento,
        public.pagamentos, public.parcelas, public.contratos, public.clientes,
        public.convites, public.configuracoes_operacao, public.membros_operacao,
        public.operacoes, public.perfis, auth.users restart identity cascade;
      set session_replication_role = origin;
    `)
  })
}

/** Centavos chegam do driver como string quando a coluna é BIGINT. */
export function cents(valor: unknown): number {
  return typeof valor === 'string' ? Number(valor) : (valor as number)
}
