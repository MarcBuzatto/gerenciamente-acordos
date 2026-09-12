import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp, type DadosCliente } from '../../state/loja'
import { Cabecalho } from '../components/Layout'
import { Aviso, Campo, Recolhivel } from '../components/Base'
import { normalizarEntradaData } from '../../domain/dates'
import { classificar } from '../../data/api'

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ',
  'RN','RO','RR','RS','SC','SE','SP','TO',
]

const VAZIO: DadosCliente = {
  nome: '',
  telefone: '',
  cpfCnpj: '',
  email: '',
  rg: '',
  nascimento: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  cidade: '',
  estado: '',
  veiculoTipo: '',
  veiculoCondicao: '',
  placa: '',
}

function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`
}

function mascararCep(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function ClienteFormulario({ modo }: { modo: 'novo' | 'editar' }) {
  const { estado, criarCliente, atualizarCliente } = useApp()
  const navegar = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const retorno = params.get('retorno')

  const existente = useMemo(
    () => (modo === 'editar' ? estado.clientes.find((c) => c.id === id) : undefined),
    [modo, id, estado.clientes],
  )

  const [dados, setDados] = useState<DadosCliente>(() => {
    if (existente) {
      const { id: _i, operacaoId: _o, criadoEm: _c, ...resto } = existente
      return { ...VAZIO, ...resto }
    }
    return { ...VAZIO }
  })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  function definir<K extends keyof DadosCliente>(chave: K, valor: DadosCliente[K]) {
    setDados((d) => ({ ...d, [chave]: valor }))
    setErros((e) => {
      if (!e[chave as string]) return e
      const { [chave as string]: _ignorado, ...resto } = e
      return resto
    })
  }

  function validar(): boolean {
    const novos: Record<string, string> = {}
    if (dados.nome.trim().length < 3) novos.nome = 'Informe o nome completo do cliente.'
    const digitos = dados.telefone.replace(/\D/g, '')
    if (digitos.length < 10) novos.telefone = 'Informe o telefone com DDD (10 ou 11 dígitos).'
    if (dados.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email))
      novos.email = 'E-mail inválido.'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!validar() || salvando) return
    const limpo: DadosCliente = {
      ...dados,
      nome: dados.nome.trim().replace(/\s+/g, ' '),
      telefone: mascararTelefone(dados.telefone),
    }
    setSalvando(true)
    setFalha(null)
    try {
      if (modo === 'editar' && existente) {
        await atualizarCliente(existente.id, limpo)
        navegar(`/clientes/${existente.id}`, { replace: true })
        return
      }
      const cliente = await criarCliente(limpo)
      if (retorno) {
        navegar(`${retorno}${retorno.includes('?') ? '&' : '?'}cliente=${cliente.id}`, {
          replace: true,
        })
        return
      }
      navegar(`/clientes/${cliente.id}`, { replace: true })
    } catch (e) {
      // Sem confirmação do servidor não há cadastro: a tela mostra a falha.
      setFalha(classificar(e).message)
    } finally {
      setSalvando(false)
    }
  }

  if (modo === 'editar' && !existente) {
    return (
      <>
        <Cabecalho titulo="Cliente" voltarPara="/clientes" />
        <Aviso tipo="erro">Cliente não encontrado nesta operação.</Aviso>
      </>
    )
  }

  return (
    <>
      <Cabecalho
        titulo={modo === 'editar' ? 'Editar cliente' : 'Novo cliente'}
        subtitulo={retorno ? 'Ao salvar, você volta para o contrato em preenchimento' : undefined}
        voltarPara=""
      />

      <form className="pilha" onSubmit={(e) => void salvar(e)} noValidate>
        <section className="cartao">
          <div className="pilha">
            <Campo rotulo="Nome" htmlFor="nome" obrigatorio erro={erros.nome}>
              <input
                id="nome"
                className="entrada"
                value={dados.nome}
                autoComplete="name"
                aria-invalid={Boolean(erros.nome)}
                onChange={(e) => definir('nome', e.target.value)}
              />
            </Campo>

            <Campo
              rotulo="Telefone com DDD"
              htmlFor="telefone"
              obrigatorio
              erro={erros.telefone}
              dica="Exemplo: (75) 9 8888-7777"
            >
              <input
                id="telefone"
                className="entrada"
                inputMode="tel"
                value={dados.telefone}
                aria-invalid={Boolean(erros.telefone)}
                onChange={(e) => definir('telefone', mascararTelefone(e.target.value))}
              />
            </Campo>
          </div>
        </section>

        <p className="txt-peq" style={{ padding: '0 2px' }}>
          Nome e telefone bastam para cadastrar. Os campos abaixo são opcionais.
        </p>

        <Recolhivel titulo="Documentos e contato">
          <div className="pilha">
            <Campo rotulo="CPF/CNPJ" htmlFor="cpf">
              <input
                id="cpf"
                className="entrada"
                inputMode="numeric"
                value={dados.cpfCnpj}
                onChange={(e) => definir('cpfCnpj', e.target.value)}
              />
            </Campo>
            <Campo rotulo="E-mail" htmlFor="email" erro={erros.email}>
              <input
                id="email"
                type="email"
                className="entrada"
                value={dados.email}
                aria-invalid={Boolean(erros.email)}
                onChange={(e) => definir('email', e.target.value)}
              />
            </Campo>
            <div className="grade-2">
              <Campo rotulo="RG" htmlFor="rg">
                <input
                  id="rg"
                  className="entrada"
                  value={dados.rg}
                  onChange={(e) => definir('rg', e.target.value)}
                />
              </Campo>
              <Campo rotulo="Nascimento" htmlFor="nascimento">
                <input
                  id="nascimento"
                  type="date"
                  className="entrada"
                  value={dados.nascimento}
                  onChange={(e) => definir('nascimento', normalizarEntradaData(e.target.value) ?? '')}
                />
              </Campo>
            </div>
          </div>
        </Recolhivel>

        <Recolhivel titulo="Endereço">
          <div className="pilha">
            <div className="grade-2">
              <Campo rotulo="CEP" htmlFor="cep">
                <input
                  id="cep"
                  className="entrada"
                  inputMode="numeric"
                  value={dados.cep}
                  onChange={(e) => definir('cep', mascararCep(e.target.value))}
                />
              </Campo>
              <Campo rotulo="Número" htmlFor="numero">
                <input
                  id="numero"
                  className="entrada"
                  value={dados.numero}
                  onChange={(e) => definir('numero', e.target.value)}
                />
              </Campo>
            </div>
            <Campo rotulo="Rua" htmlFor="rua">
              <input
                id="rua"
                className="entrada"
                value={dados.rua}
                onChange={(e) => definir('rua', e.target.value)}
              />
            </Campo>
            <Campo rotulo="Complemento" htmlFor="complemento">
              <input
                id="complemento"
                className="entrada"
                value={dados.complemento}
                onChange={(e) => definir('complemento', e.target.value)}
              />
            </Campo>
            <div className="grade-2">
              <Campo rotulo="Cidade" htmlFor="cidade">
                <input
                  id="cidade"
                  className="entrada"
                  value={dados.cidade}
                  onChange={(e) => definir('cidade', e.target.value)}
                />
              </Campo>
              <Campo rotulo="Estado" htmlFor="estado">
                <select
                  id="estado"
                  className="selecao"
                  value={dados.estado}
                  onChange={(e) => definir('estado', e.target.value)}
                >
                  <option value="">—</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </div>
        </Recolhivel>

        <Recolhivel titulo="Veículo">
          <div className="pilha">
            <div className="grade-2">
              <Campo rotulo="Tipo" htmlFor="veiculo-tipo">
                <select
                  id="veiculo-tipo"
                  className="selecao"
                  value={dados.veiculoTipo}
                  onChange={(e) => definir('veiculoTipo', e.target.value as 'moto' | 'carro' | '')}
                >
                  <option value="">—</option>
                  <option value="moto">Moto</option>
                  <option value="carro">Carro</option>
                </select>
              </Campo>
              <Campo rotulo="Condição" htmlFor="veiculo-condicao">
                <select
                  id="veiculo-condicao"
                  className="selecao"
                  value={dados.veiculoCondicao}
                  onChange={(e) =>
                    definir('veiculoCondicao', e.target.value as 'proprio' | 'alugado' | '')
                  }
                >
                  <option value="">—</option>
                  <option value="proprio">Próprio</option>
                  <option value="alugado">Alugado</option>
                </select>
              </Campo>
            </div>
            <Campo rotulo="Placa" htmlFor="placa">
              <input
                id="placa"
                className="entrada"
                style={{ textTransform: 'uppercase' }}
                value={dados.placa}
                onChange={(e) => definir('placa', e.target.value.toUpperCase())}
              />
            </Campo>
          </div>
        </Recolhivel>

        {falha && <Aviso tipo="erro">{falha}</Aviso>}

        <div className="pilha-sm" style={{ marginTop: 4 }}>
          <button type="submit" className="btn btn--primario btn--bloco" disabled={salvando}>
            {salvando
              ? 'Salvando…'
              : modo === 'editar'
                ? 'Salvar alterações'
                : 'Cadastrar cliente'}
          </button>
          <button
            type="button"
            className="btn btn--secundario btn--bloco"
            onClick={() => navegar(-1)}
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  )
}
