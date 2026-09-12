import { describe, expect, it } from 'vitest'
import { FalhaApi, classificar, novaChave } from '../api'

/**
 * Verificação 14: erro de conexão não pode virar falso sucesso.
 *
 * A classificação é o que decide a mensagem que a tela mostra. Se uma falha de
 * rede fosse classificada como "desconhecida" genérica, ou pior, engolida, o
 * usuário poderia achar que o Pix foi registrado quando nada chegou ao servidor.
 */
describe('classificação de falhas', () => {
  it('trata falha de rede como falta de conexão, deixando claro que nada foi salvo', () => {
    const falha = classificar(new TypeError('Failed to fetch'))
    expect(falha.tipo).toBe('conexao')
    expect(falha.message).toMatch(/nada foi salvo/i)
  })

  it('reconhece sessão expirada', () => {
    expect(classificar({ message: 'JWT expired', status: 401 }).tipo).toBe('sessao_expirada')
  })

  it('reconhece falta de permissão vinda das políticas e das funções', () => {
    expect(classificar({ code: '42501', message: 'permission denied' }).tipo).toBe('sem_permissao')
    expect(classificar({ message: 'Sem vínculo ativo com esta operação.' }).tipo).toBe('sem_permissao')
    expect(classificar({ message: 'Verificação em duas etapas exigida.' }).tipo).toBe('sem_permissao')
    expect(classificar({ message: 'Ação restrita ao proprietário da operação.' }).tipo).toBe(
      'sem_permissao',
    )
  })

  it('reconhece conflito de parcela já paga e de reversão repetida', () => {
    expect(classificar({ code: '23505', message: 'duplicate key' }).tipo).toBe('conflito')
    expect(classificar({ message: 'Esta parcela já consta como paga.' }).tipo).toBe('conflito')
    expect(classificar({ message: 'Este pagamento já foi desfeito.' }).tipo).toBe('conflito')
  })

  it('reconhece entrada inválida recusada pelo servidor', () => {
    expect(classificar({ code: '22023', message: 'data futura' }).tipo).toBe('invalido')
    expect(classificar({ code: '23514', message: 'check constraint' }).tipo).toBe('invalido')
  })

  it('preserva uma falha já classificada', () => {
    const original = new FalhaApi('conflito', 'já consta como paga')
    expect(classificar(original)).toBe(original)
  })
})

describe('chave de idempotência', () => {
  it('gera chaves distintas a cada lançamento', () => {
    const chaves = new Set(Array.from({ length: 200 }, () => novaChave('pagamento')))
    expect(chaves.size).toBe(200)
    expect([...chaves][0].startsWith('pagamento:')).toBe(true)
  })
})
