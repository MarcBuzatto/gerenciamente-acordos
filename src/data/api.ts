import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { ISODate } from '../domain/dates'
import type {
  Cliente,
  Contrato,
  Frequencia,
  Pagamento,
  Parcela,
  PerfilUsuario,
} from '../domain/tipos'

/**
 * Camada de acesso ao Supabase.
 *
 * Regras que valem para todo este arquivo:
 *
 * - Nenhuma escrita financeira acontece por INSERT direto. Contrato, pagamento,
 *   quitação e reversão passam por funções transacionais no Postgres, que
 *   validam papel, operação e datas e determinam os valores. O navegador nunca
 *   manda dinheiro pronto.
 * - Nada é dado como salvo antes da confirmação do servidor: em erro, a função
 *   lança, e a tela mostra a falha em vez de sucesso.
 * - Centavos chegam como number; as colunas são BIGINT limitadas por CHECK a
 *   valores bem abaixo de 2^53, então não há perda de precisão.
 */

// -----------------------------------------------------------------------------
// Erros
// -----------------------------------------------------------------------------

export type TipoFalha =
  | 'conexao'
  | 'sessao_expirada'
  | 'sem_permissao'
  | 'conflito'
  | 'invalido'
  | 'desconhecida'

export class FalhaApi extends Error {
  constructor(
    readonly tipo: TipoFalha,
    mensagem: string,
    readonly original?: unknown,
  ) {
    super(mensagem)
    this.name = 'FalhaApi'
  }
}

export function classificar(erro: unknown): FalhaApi {
  if (erro instanceof FalhaApi) return erro

  const e = erro as Partial<PostgrestError> & { message?: string; status?: number }
  const mensagem = e?.message ?? 'Não foi possível concluir a operação.'

  // Sem rede, DNS caído, requisição abortada: o navegador entrega TypeError.
  if (erro instanceof TypeError || /fetch|network|failed to fetch/i.test(mensagem)) {
    return new FalhaApi(
      'conexao',
      'Sem conexão com o servidor. Nada foi salvo — tente de novo quando voltar o sinal.',
      erro,
    )
  }
  if (e?.status === 401 || /jwt|token|expired|not authenticated|28000/i.test(mensagem)) {
    return new FalhaApi('sessao_expirada', 'Sua sessão expirou. Entre novamente.', erro)
  }
  if (e?.code === '42501' || /permission|restrita|vínculo|duas etapas/i.test(mensagem)) {
    return new FalhaApi('sem_permissao', mensagem, erro)
  }
  if (e?.code === '23505' || /já consta|já foi desfeito|já está quitado|duplicate/i.test(mensagem)) {
    return new FalhaApi('conflito', mensagem, erro)
  }
  if (e?.code?.startsWith('22') || e?.code === '23514') {
    return new FalhaApi('invalido', mensagem, erro)
  }
  return new FalhaApi('desconhecida', mensagem, erro)
}

async function exigir<T>(promessa: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let resposta: { data: T | null; error: unknown }
  try {
    resposta = await promessa
  } catch (erro) {
    throw classificar(erro)
  }
  if (resposta.error) throw classificar(resposta.error)
  return resposta.data as T
}

/** Chave de idempotência para escritas que não podem duplicar. */
export function novaChave(prefixo: string): string {
  const aleatorio =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefixo}:${aleatorio}`
}

// -----------------------------------------------------------------------------
// Identidade e vínculo
// -----------------------------------------------------------------------------

export interface Vinculo {
  operacaoId: string
  operacaoNome: string
  cidade: string
  fuso: string
  papel: PerfilUsuario
}

export async function carregarVinculo(): Promise<Vinculo | null> {
  const linhas = await exigir(
    supabase()
      .from('membros_operacao')
      .select('papel, operacoes!inner(id, nome, cidade, fuso)')
      .eq('ativo', true)
      .limit(1),
  )
  const linha = (linhas as unknown as {
    papel: PerfilUsuario
    operacoes: { id: string; nome: string; cidade: string; fuso: string }
  }[])[0]
  if (!linha) return null
  return {
    operacaoId: linha.operacoes.id,
    operacaoNome: linha.operacoes.nome,
    cidade: linha.operacoes.cidade,
    fuso: linha.operacoes.fuso,
    papel: linha.papel,
  }
}

export async function provisionarProprietario(nomeOperacao: string): Promise<string> {
  return exigir(
    supabase().rpc('provisionar_proprietario', { p_nome_operacao: nomeOperacao }),
  ) as Promise<string>
}

export async function aceitarConvite(token: string): Promise<string> {
  return exigir(supabase().rpc('aceitar_convite', { p_token: token })) as Promise<string>
}

export interface Membro {
  usuarioId: string
  papel: PerfilUsuario
  nome: string
  email: string
  ativo: boolean
}

export async function listarMembros(operacaoId: string): Promise<Membro[]> {
  const linhas = await exigir(
    supabase()
      .from('membros_operacao')
      .select('usuario_id, papel, ativo, perfis!inner(nome, email)')
      .eq('operacao_id', operacaoId)
      .order('papel'),
  )
  return (linhas as unknown as {
    usuario_id: string
    papel: PerfilUsuario
    ativo: boolean
    perfis: { nome: string; email: string }
  }[]).map((l) => ({
    usuarioId: l.usuario_id,
    papel: l.papel,
    ativo: l.ativo,
    nome: l.perfis.nome,
    email: l.perfis.email,
  }))
}

export async function criarConvite(operacaoId: string, email: string): Promise<string> {
  return exigir(
    supabase().rpc('criar_convite', { p_operacao: operacaoId, p_email: email }),
  ) as Promise<string>
}

export async function revogarMembro(operacaoId: string, usuarioId: string): Promise<void> {
  await exigir(
    supabase().rpc('revogar_membro', { p_operacao: operacaoId, p_usuario: usuarioId }),
  )
}

// -----------------------------------------------------------------------------
// Clientes
// -----------------------------------------------------------------------------


function paraCliente(linha: Record<string, unknown>): Cliente {
  return {
    id: linha.id as string,
    operacaoId: linha.operacao_id as string,
    nome: linha.nome as string,
    telefone: linha.telefone as string,
    cpfCnpj: (linha.cpf_cnpj as string) ?? undefined,
    email: (linha.email as string) ?? undefined,
    rg: (linha.rg as string) ?? undefined,
    nascimento: (linha.nascimento as ISODate) ?? undefined,
    cep: (linha.cep as string) ?? undefined,
    rua: (linha.rua as string) ?? undefined,
    numero: (linha.numero as string) ?? undefined,
    complemento: (linha.complemento as string) ?? undefined,
    cidade: (linha.cidade as string) ?? undefined,
    estado: (linha.estado as string) ?? undefined,
    veiculoTipo: (linha.veiculo_tipo as Cliente['veiculoTipo']) ?? '',
    veiculoCondicao: (linha.veiculo_condicao as Cliente['veiculoCondicao']) ?? '',
    placa: (linha.placa as string) ?? undefined,
    criadoEm: linha.criado_em as string,
  }
}

function paraColunas(entrada: Omit<Cliente, 'id' | 'operacaoId' | 'criadoEm'>) {
  const vazioParaNulo = (v: string | undefined | null) => (v && v.trim() !== '' ? v.trim() : null)
  return {
    nome: entrada.nome.trim().replace(/\s+/g, ' '),
    telefone: entrada.telefone,
    cpf_cnpj: vazioParaNulo(entrada.cpfCnpj),
    email: vazioParaNulo(entrada.email),
    rg: vazioParaNulo(entrada.rg),
    nascimento: vazioParaNulo(entrada.nascimento),
    cep: vazioParaNulo(entrada.cep),
    rua: vazioParaNulo(entrada.rua),
    numero: vazioParaNulo(entrada.numero),
    complemento: vazioParaNulo(entrada.complemento),
    cidade: vazioParaNulo(entrada.cidade),
    estado: vazioParaNulo(entrada.estado),
    veiculo_tipo: vazioParaNulo(entrada.veiculoTipo),
    veiculo_condicao: vazioParaNulo(entrada.veiculoCondicao),
    placa: vazioParaNulo(entrada.placa),
  }
}

export async function listarClientes(operacaoId: string): Promise<Cliente[]> {
  const linhas = await exigir(
    supabase().from('clientes').select('*').eq('operacao_id', operacaoId).order('nome'),
  )
  return (linhas as unknown as Record<string, unknown>[]).map(paraCliente)
}

export async function criarCliente(
  operacaoId: string,
  usuarioId: string,
  entrada: Omit<Cliente, 'id' | 'operacaoId' | 'criadoEm'>,
): Promise<Cliente> {
  const linha = await exigir(
    supabase()
      .from('clientes')
      .insert({ ...paraColunas(entrada), operacao_id: operacaoId, criado_por: usuarioId })
      .select()
      .single(),
  )
  return paraCliente(linha as unknown as Record<string, unknown>)
}

export async function atualizarCliente(
  clienteId: string,
  usuarioId: string,
  entrada: Omit<Cliente, 'id' | 'operacaoId' | 'criadoEm'>,
): Promise<Cliente> {
  const linha = await exigir(
    supabase()
      .from('clientes')
      .update({ ...paraColunas(entrada), atualizado_por: usuarioId, atualizado_em: new Date().toISOString() })
      .eq('id', clienteId)
      .select()
      .single(),
  )
  return paraCliente(linha as unknown as Record<string, unknown>)
}

// -----------------------------------------------------------------------------
// Contratos e parcelas (leitura de proprietário)
// -----------------------------------------------------------------------------

export async function listarContratos(operacaoId: string): Promise<Contrato[]> {
  const linhas = await exigir(
    supabase()
      .from('contratos')
      .select('*')
      .eq('operacao_id', operacaoId)
      .order('numero', { ascending: false }),
  )
  return (linhas as unknown as Record<string, unknown>[]).map((l) => ({
    id: l.id as string,
    operacaoId: l.operacao_id as string,
    clienteId: l.cliente_id as string,
    numero: l.numero as number,
    principalCents: Number(l.principal_cents),
    taxaPercent: Number(l.taxa_percent),
    jurosCents: Number(l.juros_cents),
    totalCents: Number(l.total_cents),
    frequencia: l.frequencia as Frequencia,
    qtdParcelas: l.qtd_parcelas as number,
    primeiroVencimento: l.primeiro_vencimento as ISODate,
    dataContrato: l.data_contrato as ISODate,
    observacao: (l.observacao as string) ?? undefined,
    criadoEm: l.criado_em as string,
    criadoPor: l.criado_por as string,
  }))
}

export async function listarParcelas(operacaoId: string): Promise<Parcela[]> {
  const linhas = await exigir(
    supabase()
      .from('parcelas')
      .select('*')
      .eq('operacao_id', operacaoId)
      .order('numero'),
  )
  return (linhas as unknown as Record<string, unknown>[]).map((l) => ({
    id: l.id as string,
    operacaoId: l.operacao_id as string,
    contratoId: l.contrato_id as string,
    numero: l.numero as number,
    vencimento: l.vencimento as ISODate,
    valorCents: Number(l.valor_cents),
    principalCents: Number(l.principal_cents),
    jurosCents: Number(l.juros_cents),
  }))
}

export async function listarPagamentos(operacaoId: string): Promise<Pagamento[]> {
  const linhas = await exigir(
    supabase()
      .from('pagamentos')
      .select('*, alocacoes_pagamento(parcela_id, valor_original_cents, acrescimo_cents), estornos_pagamento(motivo, criado_em, criado_por)')
      .eq('operacao_id', operacaoId)
      .order('data_pagamento'),
  )
  return (linhas as unknown as Record<string, unknown>[]).map((l) => {
    const itens = (l.alocacoes_pagamento as Record<string, unknown>[]).map((a) => ({
      parcelaId: a.parcela_id as string,
      valorOriginalCents: Number(a.valor_original_cents),
      acrescimoCents: Number(a.acrescimo_cents),
    }))
    const estorno = (l.estornos_pagamento as Record<string, unknown>[])?.[0]
    return {
      id: l.id as string,
      operacaoId: l.operacao_id as string,
      contratoId: l.contrato_id as string,
      parcelaIds: itens.map((i) => i.parcelaId),
      itens,
      dataPagamento: l.data_pagamento as ISODate,
      registradoEm: l.registrado_em as string,
      registradoPor: l.registrado_por as string,
      valorOriginalCents: Number(l.valor_original_cents),
      acrescimoCents: Number(l.acrescimo_cents),
      valorTotalCents: Number(l.valor_total_cents),
      meio: 'pix' as const,
      tipo: l.tipo as 'parcela' | 'quitacao',
      estorno: l.estornado_em
        ? {
            em: l.estornado_em as string,
            por: (l.estornado_por as string) ?? '',
            motivo: (estorno?.motivo as string) ?? '',
          }
        : undefined,
    }
  })
}

// -----------------------------------------------------------------------------
// Vencimentos — projeção que serve aos dois papéis
// -----------------------------------------------------------------------------

export type FiltroVencimento = 'hoje' | 'atrasados' | 'proximos' | 'pagos' | 'todos'

export interface LinhaVencimento {
  parcelaId: string
  contratoId: string
  clienteId: string
  clienteNome: string
  clienteTelefone: string
  contratoNumero: number
  parcelaNumero: number
  qtdParcelas: number
  vencimento: ISODate
  dataContrato: ISODate
  situacao: 'paga' | 'atrasada' | 'hoje' | 'a_vencer'
  valorOriginalCents: number
  acrescimoCents: number
  totalDevidoCents: number
  diasDeAtraso: number
  dataPagamento: ISODate | null
}

export async function listarVencimentos(
  operacaoId: string,
  filtro: FiltroVencimento,
  busca?: string,
): Promise<LinhaVencimento[]> {
  const linhas = await exigir(
    supabase().rpc('listar_vencimentos', {
      p_operacao: operacaoId,
      p_filtro: filtro,
      p_busca: busca?.trim() || null,
    }),
  )
  return (linhas as unknown as Record<string, unknown>[]).map((l) => ({
    parcelaId: l.parcela_id as string,
    contratoId: l.contrato_id as string,
    clienteId: l.cliente_id as string,
    clienteNome: l.cliente_nome as string,
    clienteTelefone: l.cliente_telefone as string,
    contratoNumero: l.contrato_numero as number,
    parcelaNumero: l.parcela_numero as number,
    qtdParcelas: l.qtd_parcelas as number,
    vencimento: l.vencimento as ISODate,
    dataContrato: l.data_contrato as ISODate,
    situacao: l.situacao as LinhaVencimento['situacao'],
    valorOriginalCents: Number(l.valor_original_cents),
    acrescimoCents: Number(l.acrescimo_cents),
    totalDevidoCents: Number(l.total_devido_cents),
    diasDeAtraso: Number(l.dias_de_atraso),
    dataPagamento: (l.data_pagamento as ISODate) ?? null,
  }))
}

export interface ParcelaParaCobranca {
  parcelaId: string
  contratoId: string
  clienteNome: string
  contratoNumero: number
  parcelaNumero: number
  qtdParcelas: number
  vencimento: ISODate
  dataContrato: ISODate
  valorOriginalCents: number
  acrescimoHojeCents: number
  hoje: ISODate
  jaPaga: boolean
}

export async function parcelaParaCobranca(
  operacaoId: string,
  parcelaId: string,
): Promise<ParcelaParaCobranca | null> {
  const linhas = await exigir(
    supabase().rpc('parcela_para_cobranca', { p_operacao: operacaoId, p_parcela: parcelaId }),
  )
  const l = (linhas as unknown as Record<string, unknown>[])[0]
  if (!l) return null
  return {
    parcelaId: l.parcela_id as string,
    contratoId: l.contrato_id as string,
    clienteNome: l.cliente_nome as string,
    contratoNumero: l.contrato_numero as number,
    parcelaNumero: l.parcela_numero as number,
    qtdParcelas: l.qtd_parcelas as number,
    vencimento: l.vencimento as ISODate,
    dataContrato: l.data_contrato as ISODate,
    valorOriginalCents: Number(l.valor_original_cents),
    acrescimoHojeCents: Number(l.acrescimo_hoje_cents),
    hoje: l.hoje as ISODate,
    jaPaga: Boolean(l.ja_paga),
  }
}

/** Recalcula o valor devido numa data anterior, para recebimento retroativo. */
export async function valorDevidoEm(
  operacaoId: string,
  parcelaId: string,
  data: ISODate,
): Promise<{ valorOriginalCents: number; acrescimoCents: number; totalCents: number }> {
  const linhas = await exigir(
    supabase().rpc('valor_devido_em', {
      p_operacao: operacaoId,
      p_parcela: parcelaId,
      p_data: data,
    }),
  )
  const l = (linhas as unknown as Record<string, unknown>[])[0]
  return {
    valorOriginalCents: Number(l?.valor_original_cents ?? 0),
    acrescimoCents: Number(l?.acrescimo_cents ?? 0),
    totalCents: Number(l?.total_cents ?? 0),
  }
}

// -----------------------------------------------------------------------------
// Indicadores (proprietário)
// -----------------------------------------------------------------------------

export interface IndicadoresServidor {
  dataReferencia: ISODate
  recebidoHojeCents: number
  qtdRecebimentosHoje: number
  pendenteHojeCents: number
  qtdPendentesHoje: number
  totalAtrasadoCents: number
  qtdAtrasadas: number
  principalEmAbertoCents: number
  jurosEmAbertoCents: number
  acrescimosEmAbertoCents: number
  totalAReceberCents: number
  contratosAbertos: number
  contratosAtrasados: number
}

export async function carregarIndicadores(operacaoId: string): Promise<IndicadoresServidor> {
  const linhas = await exigir(supabase().rpc('indicadores', { p_operacao: operacaoId }))
  const l = (linhas as unknown as Record<string, unknown>[])[0] ?? {}
  return {
    dataReferencia: l.data_referencia as ISODate,
    recebidoHojeCents: Number(l.recebido_hoje_cents ?? 0),
    qtdRecebimentosHoje: Number(l.qtd_recebimentos_hoje ?? 0),
    pendenteHojeCents: Number(l.pendente_hoje_cents ?? 0),
    qtdPendentesHoje: Number(l.qtd_pendentes_hoje ?? 0),
    totalAtrasadoCents: Number(l.total_atrasado_cents ?? 0),
    qtdAtrasadas: Number(l.qtd_atrasadas ?? 0),
    principalEmAbertoCents: Number(l.principal_em_aberto_cents ?? 0),
    jurosEmAbertoCents: Number(l.juros_em_aberto_cents ?? 0),
    acrescimosEmAbertoCents: Number(l.acrescimos_em_aberto_cents ?? 0),
    totalAReceberCents: Number(l.total_a_receber_cents ?? 0),
    contratosAbertos: Number(l.contratos_abertos ?? 0),
    contratosAtrasados: Number(l.contratos_atrasados ?? 0),
  }
}

// -----------------------------------------------------------------------------
// Escritas financeiras — sempre por função transacional
// -----------------------------------------------------------------------------

export async function criarContrato(entrada: {
  operacaoId: string
  clienteId: string
  principalCents: number
  taxaPercent: number
  frequencia: Frequencia
  qtdParcelas: number
  primeiroVencimento: ISODate
  observacao?: string
  chave: string
}): Promise<string> {
  return exigir(
    supabase().rpc('criar_contrato', {
      p_operacao: entrada.operacaoId,
      p_cliente: entrada.clienteId,
      p_principal_cents: entrada.principalCents,
      p_taxa_percent: entrada.taxaPercent,
      p_frequencia: entrada.frequencia,
      p_qtd_parcelas: entrada.qtdParcelas,
      p_primeiro_vencimento: entrada.primeiroVencimento,
      p_observacao: entrada.observacao ?? null,
      p_chave_idempotencia: entrada.chave,
    }),
  ) as Promise<string>
}

export async function registrarPagamento(entrada: {
  operacaoId: string
  parcelaId: string
  dataPagamento: ISODate
  chave: string
}): Promise<string> {
  return exigir(
    supabase().rpc('registrar_pagamento', {
      p_operacao: entrada.operacaoId,
      p_parcela: entrada.parcelaId,
      p_data_pagamento: entrada.dataPagamento,
      p_chave_idempotencia: entrada.chave,
    }),
  ) as Promise<string>
}

export async function quitarContrato(entrada: {
  operacaoId: string
  contratoId: string
  dataPagamento: ISODate
  chave: string
}): Promise<string> {
  return exigir(
    supabase().rpc('quitar_contrato', {
      p_operacao: entrada.operacaoId,
      p_contrato: entrada.contratoId,
      p_data_pagamento: entrada.dataPagamento,
      p_chave_idempotencia: entrada.chave,
    }),
  ) as Promise<string>
}

export async function reverterPagamento(entrada: {
  operacaoId: string
  pagamentoId: string
  motivo: string
}): Promise<string> {
  return exigir(
    supabase().rpc('reverter_pagamento', {
      p_operacao: entrada.operacaoId,
      p_pagamento: entrada.pagamentoId,
      p_motivo: entrada.motivo,
    }),
  ) as Promise<string>
}

// -----------------------------------------------------------------------------
// Configuração da operação
// -----------------------------------------------------------------------------

export async function carregarConfiguracao(
  operacaoId: string,
): Promise<{ feriadosAtivos: string[] }> {
  const linha = await exigir(
    supabase()
      .from('configuracoes_operacao')
      .select('feriados_ativos')
      .eq('operacao_id', operacaoId)
      .single(),
  )
  return { feriadosAtivos: (linha as unknown as { feriados_ativos: string[] }).feriados_ativos }
}

export async function salvarFeriados(operacaoId: string, ids: string[]): Promise<void> {
  await exigir(
    supabase()
      .from('configuracoes_operacao')
      .update({ feriados_ativos: ids, atualizado_em: new Date().toISOString() })
      .eq('operacao_id', operacaoId),
  )
}

/**
 * Data corrente da operação, segundo o servidor.
 * O relógio do dispositivo não decide data de transação.
 */
export async function hojeNaOperacao(operacaoId: string): Promise<ISODate> {
  return exigir(
    supabase().rpc('data_da_operacao', { p_operacao: operacaoId }),
  ) as Promise<ISODate>
}
