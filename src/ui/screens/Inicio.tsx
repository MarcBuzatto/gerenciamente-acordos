import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../state/loja'
import { Cabecalho } from '../components/Layout'
import { Aviso, Cartao, LinhaDado, Vazio } from '../components/Base'
import { ItemParcela } from '../components/ItemParcela'
import { PainelPagamento } from '../components/PainelPagamento'
import { classificar, type IndicadoresServidor, type LinhaVencimento } from '../../data/api'
import { formatarData, rotuloDiaSemana } from '../../domain/dates'
import { formatarMoeda } from '../../domain/dinheiro'
import {
  IconeAdicionar,
  IconeAtencao,
  IconeCheck,
  IconeCofre,
  IconePix,
  IconeRelogio,
  IconeSeta,
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
  const {
    dataReferencia,
    ehProprietario,
    operacao,
    usuario,
    carregando: carregandoApp,
    falha: falhaApp,
    recarregar,
    buscarVencimentos,
    buscarIndicadores,
  } = useApp()
  const navegar = useNavigate()

  const [indicadores, setIndicadores] = useState<IndicadoresServidor | null>(null)
  const [trabalho, setTrabalho] = useState<LinhaVencimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [falha, setFalha] = useState<string | null>(null)
  const [emPagamento, setEmPagamento] = useState<LinhaVencimento | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setFalha(null)
    try {
      const [atrasados, deHoje] = await Promise.all([
        buscarVencimentos('atrasados'),
        buscarVencimentos('hoje'),
      ])
      setTrabalho([...atrasados, ...deHoje])
      // Indicadores são do proprietário: o servidor recusa a chamada do
      // assistente, e a tela nem a faz.
      setIndicadores(ehProprietario ? await buscarIndicadores() : null)
    } catch (e) {
      setFalha(classificar(e).message)
    } finally {
      setCarregando(false)
    }
  }, [buscarVencimentos, buscarIndicadores, ehProprietario])

  useEffect(() => {
    if (carregandoApp) return
    void carregar()
  }, [carregar, carregandoApp])

  const primeiroNome = usuario.nome.split(' ')[0]

  if (falhaApp) {
    return (
      <>
        <Cabecalho titulo="Início" subtitulo={operacao.nome} />
        <Aviso tipo="erro">
          {falhaApp.message}{' '}
          <button
            type="button"
            className="btn btn--fantasma btn--pequeno"
            onClick={() => void recarregar()}
          >
            Tentar de novo
          </button>
        </Aviso>
      </>
    )
  }

  return (
    <>
      <Cabecalho
        titulo={ehProprietario ? 'Início' : 'Trabalho de hoje'}
        subtitulo={`${operacao.nome} · ${primeiroNome}`}
      />

      <div className="pilha">
        {mensagem && <Aviso tipo="positivo">{mensagem}</Aviso>}
        {falha && (
          <Aviso tipo="erro">
            {falha}{' '}
            <button
              type="button"
              className="btn btn--fantasma btn--pequeno"
              onClick={() => void carregar()}
            >
              Tentar de novo
            </button>
          </Aviso>
        )}

        {dataReferencia && (
          <div className="linha-entre" style={{ padding: '0 2px' }}>
            <div>
              <div className="txt-peq">Data de referência</div>
              <div className="txt-forte" style={{ fontSize: 15 }}>
                {rotuloDiaSemana(dataReferencia)}, {formatarData(dataReferencia)}
              </div>
            </div>
          </div>
        )}

        {ehProprietario ? (
          carregando && !indicadores ? (
            <div className="grade-indicadores">
              <div className="esqueleto" style={{ height: 84 }} />
              <div className="esqueleto" style={{ height: 84 }} />
              <div className="esqueleto" style={{ height: 84 }} />
              <div className="esqueleto" style={{ height: 84 }} />
            </div>
          ) : (
            indicadores && (
              <>
                <div className="grade-indicadores">
                  <Indicador
                    rotulo="Recebido hoje"
                    valor={formatarMoeda(indicadores.recebidoHojeCents)}
                    nota={`${indicadores.qtdRecebimentosHoje} ${indicadores.qtdRecebimentosHoje === 1 ? 'recebimento' : 'recebimentos'}`}
                    variante="positivo"
                    Icone={IconePix}
                    para="/vencimentos?filtro=pagos"
                  />
                  <Indicador
                    rotulo="Vence hoje"
                    valor={formatarMoeda(indicadores.pendenteHojeCents)}
                    nota={`${indicadores.qtdPendentesHoje} ${indicadores.qtdPendentesHoje === 1 ? 'parcela pendente' : 'parcelas pendentes'}`}
                    variante="hoje"
                    Icone={IconeRelogio}
                    para="/vencimentos?filtro=hoje"
                  />
                  <Indicador
                    rotulo="Total atrasado"
                    valor={formatarMoeda(indicadores.totalAtrasadoCents)}
                    nota={`${indicadores.qtdAtrasadas} ${indicadores.qtdAtrasadas === 1 ? 'parcela' : 'parcelas'} em atraso`}
                    variante="atraso"
                    Icone={IconeAtencao}
                    para="/vencimentos?filtro=atrasados"
                  />
                  <Indicador
                    rotulo="Pendentes hoje"
                    valor={String(indicadores.qtdPendentesHoje)}
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
                      valor={formatarMoeda(indicadores.principalEmAbertoCents)}
                    />
                    <LinhaDado
                      rotulo="Juros contratuais em aberto"
                      valor={formatarMoeda(indicadores.jurosEmAbertoCents)}
                    />
                    <LinhaDado
                      rotulo="Acréscimos por atraso"
                      valor={formatarMoeda(indicadores.acrescimosEmAbertoCents)}
                    />
                    <LinhaDado
                      rotulo="Total a receber"
                      valor={formatarMoeda(indicadores.totalAReceberCents)}
                      forte
                    />
                    <LinhaDado
                      rotulo="Contratos abertos"
                      valor={`${indicadores.contratosAbertos} (${indicadores.contratosAtrasados} com atraso)`}
                    />
                  </div>
                  <p className="txt-peq" style={{ marginTop: 10 }}>
                    <IconeCofre tamanho={13} /> Principal em aberto é a parte do dinheiro emprestado
                    ainda não recebida. Total a receber inclui os juros contratados e os acréscimos
                    já aplicados. Nenhum dos dois é resultado ou lucro.
                  </p>
                </Cartao>
              </>
            )
          )
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

        {carregando ? (
          <div className="lista" aria-busy="true">
            <div className="esqueleto" style={{ height: 112 }} />
            <div className="esqueleto" style={{ height: 112 }} />
          </div>
        ) : trabalho.length === 0 ? (
          <Vazio
            titulo="Nada a cobrar hoje"
            descricao="Não há parcelas vencendo hoje nem em atraso."
          />
        ) : (
          <ul className="lista">
            {trabalho.slice(0, 8).map((item) => (
              <ItemParcela
                key={item.parcelaId}
                item={item}
                permiteAbrirContrato={ehProprietario}
                aoRegistrar={setEmPagamento}
              />
            ))}
          </ul>
        )}

        {trabalho.length > 8 && (
          <Link to="/vencimentos" className="btn btn--secundario btn--bloco">
            Ver as {trabalho.length} cobranças
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
            void carregar()
          }}
        />
      )}
    </>
  )
}
