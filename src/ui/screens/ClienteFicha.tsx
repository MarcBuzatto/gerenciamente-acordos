import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../../state/AppContext'
import { Cabecalho } from '../components/Layout'
import { Aviso, Cartao, EtiquetaContrato, LinhaDado, Segmentado, Vazio } from '../components/Base'
import { IconeAdicionar, IconeEditar, IconeSeta, IconeTelefone } from '../components/Icones'
import { formatarData, formatarDataHora } from '../../domain/dates'
import { formatarMoeda, formatarPercentual } from '../../domain/dinheiro'
import { resumirContrato } from '../../domain/indicadores'

const ROTULO_FREQUENCIA = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' } as const

export function ClienteFicha() {
  const { id } = useParams()
  const { estado, dataReferencia, ehProprietario } = useApp()
  const [aba, setAba] = useState<'dados' | 'contratos'>('dados')

  const cliente = estado.clientes.find((c) => c.id === id)

  const contratos = useMemo(() => {
    if (!cliente) return []
    return estado.contratos
      .filter((c) => c.clienteId === cliente.id)
      .map((c) => resumirContrato(estado, c, dataReferencia))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.contrato.numero - a.contrato.numero)
  }, [cliente, estado, dataReferencia])

  if (!cliente) {
    return (
      <>
        <Cabecalho titulo="Cliente" voltarPara="/clientes" />
        <Aviso tipo="erro">Cliente não encontrado nesta operação.</Aviso>
      </>
    )
  }

  const abertos = contratos.filter((c) => c.situacao !== 'quitado')
  const encerrados = contratos.filter((c) => c.situacao === 'quitado')

  const endereco = [
    cliente.rua && `${cliente.rua}${cliente.numero ? `, ${cliente.numero}` : ''}`,
    cliente.complemento,
    cliente.cidade && `${cliente.cidade}${cliente.estado ? ` – ${cliente.estado}` : ''}`,
    cliente.cep,
  ]
    .filter(Boolean)
    .join(' · ')

  const veiculo = [
    cliente.veiculoTipo === 'moto' ? 'Moto' : cliente.veiculoTipo === 'carro' ? 'Carro' : '',
    cliente.veiculoCondicao === 'proprio'
      ? 'próprio'
      : cliente.veiculoCondicao === 'alugado'
        ? 'alugado'
        : '',
    cliente.placa,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <Cabecalho titulo={cliente.nome} subtitulo={cliente.telefone} voltarPara="/clientes" />

      <div className="pilha">
        <Segmentado
          rotuloGrupo="Seções da ficha"
          valor={aba}
          aoMudar={setAba}
          opcoes={[
            { valor: 'dados', rotulo: 'Dados' },
            { valor: 'contratos', rotulo: `Contratos (${contratos.length})` },
          ]}
        />

        {aba === 'dados' ? (
          <>
            <Cartao
              titulo="Cadastro"
              acao={
                <Link
                  to={`/clientes/${cliente.id}/editar`}
                  className="btn btn--secundario btn--pequeno"
                  style={{ minHeight: 40 }}
                >
                  <IconeEditar tamanho={15} />
                  Editar
                </Link>
              }
            >
              <div className="dados">
                <LinhaDado rotulo="Nome" valor={cliente.nome} forte />
                <LinhaDado
                  rotulo="Telefone"
                  valor={
                    <a href={`tel:${cliente.telefone.replace(/\D/g, '')}`} className="linha" style={{ justifyContent: 'flex-end' }}>
                      <IconeTelefone tamanho={14} />
                      {cliente.telefone}
                    </a>
                  }
                />
                {cliente.cpfCnpj && <LinhaDado rotulo="CPF/CNPJ" valor={cliente.cpfCnpj} />}
                {cliente.rg && <LinhaDado rotulo="RG" valor={cliente.rg} />}
                {cliente.email && <LinhaDado rotulo="E-mail" valor={cliente.email} />}
                {cliente.nascimento && (
                  <LinhaDado rotulo="Nascimento" valor={formatarData(cliente.nascimento)} />
                )}
                {endereco && <LinhaDado rotulo="Endereço" valor={endereco} />}
                {veiculo && <LinhaDado rotulo="Veículo" valor={veiculo} />}
                <LinhaDado rotulo="Cadastrado em" valor={formatarDataHora(cliente.criadoEm)} />
              </div>
            </Cartao>

            {!cliente.cpfCnpj && !endereco && (
              <Aviso>
                Só o essencial está preenchido. Os campos opcionais podem ser completados depois,
                sem travar o cadastro.
              </Aviso>
            )}
          </>
        ) : (
          <>
            {ehProprietario && (
              <Link
                to={`/contratos/novo?cliente=${cliente.id}`}
                className="btn btn--primario btn--bloco"
              >
                <IconeAdicionar tamanho={16} />
                Novo contrato para {cliente.nome.split(' ')[0]}
              </Link>
            )}

            {contratos.length === 0 ? (
              <Vazio
                titulo="Nenhum contrato"
                descricao="Este cliente ainda não tem contratos nesta operação."
              />
            ) : (
              <>
                {abertos.length > 0 && (
                  <>
                    <h2 className="secao-titulo">Em aberto</h2>
                    <ul className="lista">
                      {abertos.map((r) => (
                        <ListaContrato key={r.contrato.id} resumo={r} />
                      ))}
                    </ul>
                  </>
                )}
                {encerrados.length > 0 && (
                  <>
                    <h2 className="secao-titulo">Encerrados</h2>
                    <ul className="lista">
                      {encerrados.map((r) => (
                        <ListaContrato key={r.contrato.id} resumo={r} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

function ListaContrato({ resumo }: { resumo: NonNullable<ReturnType<typeof resumirContrato>> }) {
  const { contrato, situacao, saldoCents } = resumo
  return (
    <li>
      <Link to={`/contratos/${contrato.id}`} className="item-lista">
        <span className="item-lista__principal">
          <span className="item-lista__titulo">
            Contrato {contrato.numero} · {ROTULO_FREQUENCIA[contrato.frequencia]}
          </span>
          <span className="item-lista__sub">
            {formatarMoeda(contrato.totalCents)} em {contrato.qtdParcelas}x ·{' '}
            {formatarPercentual(contrato.taxaPercent)} · {resumo.qtdPagas}/{contrato.qtdParcelas} pagas
          </span>
        </span>
        <span className="item-lista__fim">
          <EtiquetaContrato situacao={situacao} />
          <span className="valor-destaque">{formatarMoeda(saldoCents)}</span>
        </span>
        <IconeSeta tamanho={18} />
      </Link>
    </li>
  )
}
