import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApp } from '../../state/loja'
import { Cabecalho } from '../components/Layout'
import { Aviso, EtiquetaParcela } from '../components/Base'
import { ListaParcelas } from '../components/ListaParcelas'
import { IconeCompartilhar, IconeImprimir } from '../components/Icones'
import { agoraISO, formatarData, formatarDataHora } from '../../domain/dates'
import { formatarMoeda, formatarPercentual, formatarValor } from '../../domain/dinheiro'
import { resumirContrato } from '../../domain/indicadores'

const ROTULO_FREQUENCIA = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' } as const

export function Extrato() {
  const { id } = useParams()
  const { estado, dataReferencia, operacao } = useApp()
  const [mensagem, setMensagem] = useState<string | null>(null)

  const contrato = estado.contratos.find((c) => c.id === id)
  const resumo = useMemo(
    () => (contrato ? resumirContrato(estado, contrato, dataReferencia) : null),
    [contrato, estado, dataReferencia],
  )
  const atualizadoEm = useMemo(() => agoraISO(), [])

  if (!contrato || !resumo) {
    return (
      <>
        <Cabecalho titulo="Extrato" voltarPara="/contratos" />
        <Aviso tipo="erro">Contrato não encontrado nesta operação.</Aviso>
      </>
    )
  }

  const acrescimosTotais = resumo.avaliadas.reduce((s, a) => s + a.acrescimoCents, 0)

  const textoResumo = [
    `Extrato do contrato ${contrato.numero} — ${resumo.cliente.nome}`,
    `Total contratado: ${formatarMoeda(contrato.totalCents)}`,
    `Total pago: ${formatarMoeda(resumo.totalPagoCents)}`,
    `Saldo: ${formatarMoeda(resumo.saldoCents)}`,
    `${resumo.qtdPagas} pagas · ${resumo.qtdAVencer} a vencer · ${resumo.qtdAtrasadas} atrasadas`,
    'Documento de demonstração — dados fictícios.',
  ].join('\n')

  async function compartilhar() {
    const navegador = navigator as Navigator & {
      share?: (dados: { title: string; text: string }) => Promise<void>
    }
    if (navegador.share) {
      try {
        await navegador.share({ title: `Contrato ${contrato!.numero}`, text: textoResumo })
        return
      } catch {
        // Usuário cancelou ou o recurso não está disponível.
      }
    }
    try {
      await navigator.clipboard.writeText(textoResumo)
      setMensagem('Resumo copiado. Cole onde quiser enviar. Nada foi enviado automaticamente.')
    } catch {
      setMensagem('Compartilhamento não disponível neste navegador. Use Imprimir ou salvar em PDF.')
    }
  }

  return (
    <>
      <Cabecalho
        titulo="Extrato"
        subtitulo={`Contrato ${contrato.numero} · ${resumo.cliente.nome}`}
        voltarPara={`/contratos/${contrato.id}`}
      />

      <div className="pilha">
        {mensagem && <Aviso tipo="positivo">{mensagem}</Aviso>}

        <div className="grade-2 nao-imprimir">
          <button type="button" className="btn btn--primario" onClick={() => window.print()}>
            <IconeImprimir tamanho={16} />
            Imprimir / PDF
          </button>
          <button type="button" className="btn btn--secundario" onClick={compartilhar}>
            <IconeCompartilhar tamanho={16} />
            Compartilhar
          </button>
        </div>

        <p className="txt-peq nao-imprimir" style={{ padding: '0 2px' }}>
          Extrato operacional de acompanhamento. Não é contrato, não contém cláusulas jurídicas nem
          substitui documento assinado.
        </p>

        <article className="cartao" id="extrato">
          <header style={{ marginBottom: 14 }}>
            <div className="linha-entre" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: 20 }}>Contrato {contrato.numero}</h2>
                <p className="txt-peq">
                  {operacao.nome} · {operacao.cidade}
                </p>
              </div>
              <span className="etiqueta etiqueta--neutra">Demonstração</span>
            </div>
          </header>

          <div className="grade-3" style={{ marginBottom: 12 }}>
            <BlocoCampo rotulo="Cliente" valor={resumo.cliente.nome} />
            <BlocoCampo rotulo="Telefone" valor={resumo.cliente.telefone} />
            <BlocoCampo rotulo="Data do contrato" valor={formatarData(contrato.dataContrato)} />
            <BlocoCampo
              rotulo="Primeiro vencimento"
              valor={formatarData(contrato.primeiroVencimento)}
            />
            <BlocoCampo rotulo="Frequência" valor={ROTULO_FREQUENCIA[contrato.frequencia]} />
            <BlocoCampo
              rotulo="Parcelas"
              valor={`${contrato.qtdParcelas}x ${formatarMoeda(resumo.parcelas[0]?.valorCents ?? 0)}`}
            />
            <BlocoCampo rotulo="Principal" valor={formatarMoeda(contrato.principalCents)} />
            <BlocoCampo rotulo="Taxa" valor={formatarPercentual(contrato.taxaPercent)} />
            <BlocoCampo rotulo="Juros contratuais" valor={formatarMoeda(contrato.jurosCents)} />
          </div>

          <ListaParcelas itens={resumo.avaliadas} />

          <div className="tabela-rolagem so-largo" style={{ marginBottom: 12 }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Parcela</th>
                  <th>Vencimento</th>
                  <th className="num">Valor original</th>
                  <th className="num">Acréscimo</th>
                  <th className="num">Total devido</th>
                  <th>Pagamento</th>
                  <th className="num">Valor pago</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {resumo.avaliadas.map((a) => (
                  <tr key={a.parcela.id}>
                    <td>{a.parcela.numero}</td>
                    <td>{formatarData(a.parcela.vencimento)}</td>
                    <td className="num">{formatarValor(a.valorOriginalCents)}</td>
                    <td className="num">
                      {a.acrescimoCents > 0 ? formatarValor(a.acrescimoCents) : '—'}
                    </td>
                    <td className="num">{formatarValor(a.totalDevidoCents)}</td>
                    <td>{a.pagamento ? formatarData(a.pagamento.dataPagamento) : '—'}</td>
                    <td className="num">
                      {a.pagamento
                        ? formatarValor(a.valorOriginalCents + a.acrescimoCents)
                        : '—'}
                    </td>
                    <td>
                      <EtiquetaParcela situacao={a.situacao} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>Totais</th>
                  <th className="num">{formatarValor(contrato.totalCents)}</th>
                  <th className="num">{formatarValor(acrescimosTotais)}</th>
                  <th className="num">{formatarValor(contrato.totalCents + acrescimosTotais)}</th>
                  <th />
                  <th className="num">{formatarValor(resumo.totalPagoCents)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grade-2" style={{ marginBottom: 12 }}>
            <BlocoCampo rotulo="Total do contrato" valor={formatarMoeda(contrato.totalCents)} />
            <BlocoCampo rotulo="Acréscimos por atraso" valor={formatarMoeda(acrescimosTotais)} />
            <BlocoCampo rotulo="Total pago" valor={formatarMoeda(resumo.totalPagoCents)} />
            <BlocoCampo rotulo="Saldo em aberto" valor={formatarMoeda(resumo.saldoCents)} />
          </div>

          <p style={{ fontSize: 13 }}>
            {contrato.qtdParcelas} parcelas · {resumo.qtdPagas} pagas · {resumo.qtdAVencer} a vencer ·{' '}
            {resumo.qtdAtrasadas} atrasadas
          </p>

          <footer style={{ marginTop: 14, borderTop: '1px solid var(--borda)', paddingTop: 10 }}>
            <p className="txt-peq">
              Informações atualizadas em {formatarDataHora(atualizadoEm)} · Data de referência:{' '}
              {formatarData(dataReferencia)}
            </p>
            <p className="txt-peq">
              Documento de demonstração com dados fictícios. Extrato operacional, sem valor
              contratual.
            </p>
          </footer>
        </article>
      </div>
    </>
  )
}

function BlocoCampo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="txt-peq">{rotulo}</div>
      <div className="txt-forte" style={{ fontSize: 14.5 }}>
        {valor}
      </div>
    </div>
  )
}
