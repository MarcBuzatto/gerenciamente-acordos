import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../state/AppContext'
import { Cabecalho } from '../components/Layout'
import { Aviso, Cartao, LinhaDado, Vazio } from '../components/Base'
import { ItemParcela } from '../components/ItemParcela'
import { PainelPagamento } from '../components/PainelPagamento'
import {
  avaliarTodasParcelas,
  calcularIndicadoresCarteira,
  calcularIndicadoresDia,
} from '../../domain/indicadores'
import { compararDatas, formatarData, rotuloDiaSemana } from '../../domain/dates'
import { formatarMoeda } from '../../domain/dinheiro'
import type { ParcelaAvaliada } from '../../domain/tipos'
import {
  IconeAdicionar,
  IconeCofre,
  IconePix,
  IconeRelogio,
  IconeSeta,
  IconeAtencao,
  IconeCheck,
} from '../components/Icones'

function Indicador({
  rotulo,
  valor,
  nota,
  variante,
  Icone,
  para,
}: {
  rotulo: string
  valor: string
  nota?: string
  variante?: 'positivo' | 'hoje' | 'atraso'
  Icone?: (p: { tamanho?: number }) => JSX.Element
  para?: string
}) {
  const conteudo = (
    <>
      <span className="indicador__rotulo">
        {Icone && <Icone tamanho={14} />}
        {rotulo}
      </span>
      <span className="indicador__valor">{valor}</span>
      {nota && <span className="indicador__nota">{nota}</span>}
    </>
  )
  const classe = `indicador ${variante ? `indicador--${variante}` : ''} ${para ? 'indicador--acao' : ''}`
  if (para) {
    return (
      <Link to={para} className={classe} style={{ textDecoration: 'none' }}>
        {conteudo}
      </Link>
    )
  }
  return <div className={classe}>{conteudo}</div>
}

export function Inicio() {
  const { estado, dataReferencia, ehProprietario, operacao, usuario } = useApp()
  const navegar = useNavigate()
  const [emPagamento, setEmPagamento] = useState<ParcelaAvaliada | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  const dia = useMemo(
    () => calcularIndicadoresDia(estado, dataReferencia),
    [estado, dataReferencia],
  )
  const carteira = useMemo(
    () => calcularIndicadoresCarteira(estado, dataReferencia),
    [estado, dataReferencia],
  )
  const avaliadas = useMemo(
    () => avaliarTodasParcelas(estado, dataReferencia),
    [estado, dataReferencia],
  )

  const trabalhoDoDia = useMemo(
    () =>
      avaliadas
        .filter((a) => a.situacao === 'atrasada' || a.situacao === 'hoje')
        .sort(
          (a, b) =>
            compararDatas(a.parcela.vencimento, b.parcela.vencimento) ||
            a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'),
        ),
    [avaliadas],
  )

  const primeiroNome = usuario.nome.split(' ')[0]

  return (
    <>
      <Cabecalho
        titulo={ehProprietario ? 'Início' : 'Trabalho de hoje'}
        subtitulo={`${operacao.nome} · ${primeiroNome}`}
      />

      <div className="pilha">
        {mensagem && <Aviso tipo="positivo">{mensagem}</Aviso>}

        <div className="linha-entre" style={{ padding: '0 2px' }}>
          <div>
            <div className="txt-peq">Data de referência</div>
            <div className="txt-forte" style={{ fontSize: 15 }}>
              {rotuloDiaSemana(dataReferencia)}, {formatarData(dataReferencia)}
            </div>
          </div>
        </div>

        {ehProprietario ? (
          <>
            <div className="grade-indicadores">
              <Indicador
                rotulo="Recebido hoje"
                valor={formatarMoeda(dia.recebidoHojeCents)}
                nota={`${dia.qtdRecebimentosHoje} ${dia.qtdRecebimentosHoje === 1 ? 'recebimento' : 'recebimentos'}`}
                variante="positivo"
                Icone={IconePix}
                para="/vencimentos?filtro=pagos"
              />
              <Indicador
                rotulo="Vence hoje"
                valor={formatarMoeda(dia.pendenteHojeCents)}
                nota={`${dia.qtdPendentesHoje} ${dia.qtdPendentesHoje === 1 ? 'parcela pendente' : 'parcelas pendentes'}`}
                variante="hoje"
                Icone={IconeRelogio}
                para="/vencimentos?filtro=hoje"
              />
              <Indicador
                rotulo="Total atrasado"
                valor={formatarMoeda(dia.totalAtrasadoCents)}
                nota={`${dia.qtdAtrasadas} ${dia.qtdAtrasadas === 1 ? 'parcela' : 'parcelas'} em atraso`}
                variante="atraso"
                Icone={IconeAtencao}
                para="/vencimentos?filtro=atrasados"
              />
              <Indicador
                rotulo="Pendentes hoje"
                valor={String(dia.qtdPendentesHoje)}
                nota="parcelas a receber hoje"
                Icone={IconeCheck}
                para="/vencimentos?filtro=hoje"
              />
            </div>

            <h2 className="secao-titulo">Carteira</h2>
            <Cartao>
              <div className="dados">
                <LinhaDado
                  rotulo="Principal em aberto"
                  valor={formatarMoeda(carteira.principalEmAbertoCents)}
                />
                <LinhaDado
                  rotulo="Total a receber"
                  valor={formatarMoeda(carteira.totalAReceberCents)}
                  forte
                />
                <LinhaDado
                  rotulo="Acréscimos em aberto"
                  valor={formatarMoeda(carteira.acrescimosEmAbertoCents)}
                />
                <LinhaDado
                  rotulo="Contratos abertos"
                  valor={`${carteira.contratosAbertos} (${carteira.contratosAtrasados} com atraso)`}
                />
              </div>
              <p className="txt-peq" style={{ marginTop: 10 }}>
                <IconeCofre tamanho={13} /> Principal em aberto é a parte do dinheiro emprestado
                ainda não recebida. Total a receber inclui os juros contratados e os acréscimos já
                aplicados. Nenhum dos dois é resultado ou lucro.
              </p>
            </Cartao>
          </>
        ) : (
          <div className="grade-2">
            <button
              type="button"
              className="btn btn--primario"
              style={{ minHeight: 52 }}
              onClick={() => navegar('/clientes/novo')}
            >
              <IconeAdicionar tamanho={17} />
              Novo cliente
            </button>
            <button
              type="button"
              className="btn btn--secundario"
              style={{ minHeight: 52 }}
              onClick={() => navegar('/vencimentos?filtro=hoje')}
            >
              <IconePix tamanho={17} />
              Registrar Pix
            </button>
          </div>
        )}

        <div className="linha-entre" style={{ marginTop: 4 }}>
          <h2 className="secao-titulo" style={{ margin: 0 }}>
            Lista do dia
          </h2>
          <Link to="/vencimentos" className="btn btn--fantasma btn--pequeno">
            Ver tudo
            <IconeSeta tamanho={15} />
          </Link>
        </div>

        {trabalhoDoDia.length === 0 ? (
          <Vazio
            titulo="Nada a cobrar hoje"
            descricao="Não há parcelas vencendo hoje nem em atraso nesta data de referência."
          />
        ) : (
          <ul className="lista">
            {trabalhoDoDia.slice(0, 8).map((item) => (
              <ItemParcela key={item.parcela.id} item={item} aoRegistrar={setEmPagamento} />
            ))}
          </ul>
        )}

        {trabalhoDoDia.length > 8 && (
          <Link to="/vencimentos" className="btn btn--secundario btn--bloco">
            Ver as {trabalhoDoDia.length} cobranças
          </Link>
        )}
      </div>

      {emPagamento && (
        <PainelPagamento
          item={emPagamento}
          aoFechar={() => setEmPagamento(null)}
          aoConcluir={(m) => {
            setEmPagamento(null)
            setMensagem(m)
          }}
        />
      )}
    </>
  )
}
