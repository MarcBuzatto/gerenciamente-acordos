import type { Centavos } from './dinheiro'
import type { ISODate, ISODateTime } from './dates'

export type PerfilUsuario = 'proprietario' | 'assistente'
export type Frequencia = 'diaria' | 'semanal' | 'mensal'
export type TipoVeiculo = 'moto' | 'carro'
export type CondicaoVeiculo = 'proprio' | 'alugado'

export interface Operacao {
  id: string
  nome: string
  responsavel: string
  cidade: string
}

export interface Usuario {
  id: string
  operacaoId: string
  nome: string
  perfil: PerfilUsuario
  telefone?: string
}

export interface Cliente {
  id: string
  operacaoId: string
  nome: string
  telefone: string
  cpfCnpj?: string
  email?: string
  rg?: string
  nascimento?: ISODate
  cep?: string
  rua?: string
  numero?: string
  complemento?: string
  cidade?: string
  estado?: string
  veiculoTipo?: TipoVeiculo | ''
  veiculoCondicao?: CondicaoVeiculo | ''
  placa?: string
  criadoEm: ISODateTime
}

export interface Contrato {
  id: string
  operacaoId: string
  clienteId: string
  numero: number
  principalCents: Centavos
  taxaPercent: number
  jurosCents: Centavos
  totalCents: Centavos
  frequencia: Frequencia
  qtdParcelas: number
  primeiroVencimento: ISODate
  /** Data de cadastro do contrato. Nao se confunde com o primeiro vencimento. */
  dataContrato: ISODate
  observacao?: string
  criadoEm: ISODateTime
  criadoPor: string
}

export interface Parcela {
  id: string
  operacaoId: string
  contratoId: string
  numero: number
  vencimento: ISODate
  valorCents: Centavos
  /** Composicao definida na geracao. Soma das partes = valorCents. */
  principalCents: Centavos
  jurosCents: Centavos
}

export type MeioPagamento = 'pix'

export interface ItemPagamento {
  parcelaId: string
  valorOriginalCents: Centavos
  acrescimoCents: Centavos
}

export interface Pagamento {
  id: string
  operacaoId: string
  contratoId: string
  parcelaIds: string[]
  /** Quebra por parcela, para o extrato mostrar valor original e acréscimo. */
  itens: ItemPagamento[]
  /** Data civil real do recebimento. Base de todo calculo e do painel. */
  dataPagamento: ISODate
  /** Instante da digitacao. Nunca usado em calculo financeiro. */
  registradoEm: ISODateTime
  registradoPor: string
  valorOriginalCents: Centavos
  acrescimoCents: Centavos
  valorTotalCents: Centavos
  meio: MeioPagamento
  tipo: 'parcela' | 'quitacao'
  estorno?: {
    em: ISODateTime
    por: string
    motivo: string
  }
}

export type TipoEvento =
  | 'contrato_criado'
  | 'cliente_criado'
  | 'cliente_editado'
  | 'pagamento_registrado'
  | 'pagamento_estornado'
  | 'quitacao_registrada'

export interface Evento {
  id: string
  operacaoId: string
  tipo: TipoEvento
  em: ISODateTime
  por: string
  contratoId?: string
  clienteId?: string
  pagamentoId?: string
  descricao: string
}

export interface ConfiguracaoOperacao {
  feriadosAtivos: string[]
}

export interface EstadoOperacao {
  clientes: Cliente[]
  contratos: Contrato[]
  parcelas: Parcela[]
  pagamentos: Pagamento[]
  eventos: Evento[]
  config: ConfiguracaoOperacao
  proximoNumeroContrato: number
}

export type SituacaoParcela = 'paga' | 'atrasada' | 'hoje' | 'a_vencer'
export type SituacaoContrato = 'quitado' | 'atrasado' | 'em_dia'

export interface ParcelaAvaliada {
  parcela: Parcela
  contrato: Contrato
  cliente: Cliente
  situacao: SituacaoParcela
  pagamento: Pagamento | null
  /** Valor original da parcela. */
  valorOriginalCents: Centavos
  /** Acrescimo por atraso na data de referencia (0 quando nao se aplica). */
  acrescimoCents: Centavos
  /** valorOriginal + acrescimo. */
  totalDevidoCents: Centavos
  diasDeAtraso: number
}
