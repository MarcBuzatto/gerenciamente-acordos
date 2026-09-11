import { useState } from 'react'
import { useApp } from '../../state/AppContext'
import { DATA_DEMO_INICIAL } from '../../data/seed'
import {
  formatarData,
  normalizarEntradaData,
  rotuloDiaSemana,
  somarDias,
} from '../../domain/dates'
import { Aviso, Campo, Painel, Segmentado } from './Base'
import { IconeAjustes, IconeRestaurar } from './Icones'

/**
 * Ferramenta exclusiva da demonstracao.
 *
 * Alterna perfil, operacao e data de referencia. Os seletores SIMULAM perfis e
 * contas separadas; nao sao autenticacao nem controle de acesso de producao.
 */
export function FerramentaDemo({ aoFechar }: { aoFechar: () => void }) {
  const {
    operacoes,
    operacao,
    usuarios,
    usuario,
    dataReferencia,
    trocarOperacao,
    trocarUsuario,
    definirDataReferencia,
    restaurarDemonstracao,
  } = useApp()

  const [confirmandoRestauro, setConfirmandoRestauro] = useState<null | 'operacao' | 'tudo'>(null)

  return (
    <Painel
      titulo="Ferramenta da demonstração"
      subtitulo={
        <span className="ferramenta__marca" style={{ marginTop: 6 }}>
          <IconeAjustes tamanho={12} />
          Só na demonstração
        </span>
      }
      aoFechar={aoFechar}
      acoes={
        <button type="button" className="btn btn--primario btn--bloco" onClick={aoFechar}>
          Fechar
        </button>
      }
    >
      <div className="pilha">
        <Campo rotulo="Operação" dica="Cada operação tem dados próprios e separados.">
          <Segmentado
            rotuloGrupo="Operação"
            valor={operacao.id}
            aoMudar={trocarOperacao}
            opcoes={operacoes.map((o) => ({ valor: o.id, rotulo: o.nome }))}
          />
        </Campo>

        <Campo rotulo="Perfil" dica="O perfil muda as telas e as permissões exibidas.">
          <Segmentado
            rotuloGrupo="Perfil"
            valor={usuario.id}
            aoMudar={trocarUsuario}
            opcoes={usuarios.map((u) => ({
              valor: u.id,
              rotulo: u.perfil === 'proprietario' ? `Proprietário · ${u.nome.split(' ')[0]}` : `Assistente · ${u.nome.split(' ')[0]}`,
            }))}
          />
        </Campo>

        <Campo
          rotulo="Data de referência"
          htmlFor="data-demo"
          dica={`${rotuloDiaSemana(dataReferencia)}, ${formatarData(dataReferencia)}. Vale como "hoje" em toda a demonstração.`}
        >
          <input
            id="data-demo"
            type="date"
            className="entrada"
            value={dataReferencia}
            onChange={(e) => {
              const d = normalizarEntradaData(e.target.value)
              if (d) definirDataReferencia(d)
            }}
          />
        </Campo>

        <div className="grade-3">
          <button
            type="button"
            className="btn btn--secundario btn--pequeno"
            onClick={() => definirDataReferencia(somarDias(dataReferencia, -1))}
          >
            − 1 dia
          </button>
          <button
            type="button"
            className="btn btn--secundario btn--pequeno"
            onClick={() => definirDataReferencia(DATA_DEMO_INICIAL)}
          >
            Data inicial
          </button>
          <button
            type="button"
            className="btn btn--secundario btn--pequeno"
            onClick={() => definirDataReferencia(somarDias(dataReferencia, 1))}
          >
            + 1 dia
          </button>
        </div>

        <div className="divisor" />

        <Aviso>
          Perfis, operações e armazenamento local servem apenas para demonstrar fluxos. Não
          representam autenticação nem isolamento de dados de produção.
        </Aviso>

        {confirmandoRestauro ? (
          <div className="pilha-sm">
            <Aviso tipo="atencao">
              {confirmandoRestauro === 'tudo'
                ? 'Isto apaga as alterações das duas operações e volta tudo ao cenário inicial.'
                : `Isto apaga as alterações de ${operacao.nome} e volta ao cenário inicial.`}
            </Aviso>
            <div className="grade-2">
              <button
                type="button"
                className="btn btn--secundario"
                onClick={() => setConfirmandoRestauro(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => {
                  restaurarDemonstracao(confirmandoRestauro)
                  setConfirmandoRestauro(null)
                  aoFechar()
                }}
              >
                Restaurar
              </button>
            </div>
          </div>
        ) : (
          <div className="grade-2">
            <button
              type="button"
              className="btn btn--secundario"
              onClick={() => setConfirmandoRestauro('operacao')}
            >
              <IconeRestaurar tamanho={16} />
              Esta operação
            </button>
            <button
              type="button"
              className="btn btn--secundario"
              onClick={() => setConfirmandoRestauro('tudo')}
            >
              <IconeRestaurar tamanho={16} />
              Tudo
            </button>
          </div>
        )}
      </div>
    </Painel>
  )
}
