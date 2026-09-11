import { Cabecalho } from '../components/Layout'
import { Aviso, Cartao } from '../components/Base'

function Item({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--borda)', marginBottom: 10 }}>
      <div className="txt-forte" style={{ fontSize: 14.5, marginBottom: 3 }}>
        {titulo}
      </div>
      <div className="txt-sec" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  )
}

export function Regras() {
  return (
    <>
      <Cabecalho
        titulo="Regras e pendências"
        subtitulo="Base de cálculo desta demonstração"
        voltarPara="/mais"
      />

      <div className="pilha">
        <Aviso>
          Esta tela existe para a validação com o cliente. Ela separa o que já está confirmado do
          que é decisão provisória do protótipo e do que ainda precisa ser definido.
        </Aviso>

        <Cartao titulo="Confirmado">
          <Item titulo="Juros do contrato">
            A porcentagem incide uma única vez sobre o principal, para o contrato inteiro. R$ 1.000
            com 40% gera R$ 400 de juros, R$ 1.400 de total e 20 parcelas de R$ 70.
          </Item>
          <Item titulo="Calendário das diárias">
            Segunda a sábado contam. Domingos não contam. Feriados aplicáveis a Feira de Santana–BA
            não contam. A quantidade contratada de parcelas é sempre gerada.
          </Item>
          <Item titulo="Atraso nas diárias">
            A diária não paga dobra uma única vez, no dia seguinte ao vencimento, e depois fica
            congelada. Cada diária é tratada isoladamente. O acréscimo ocorre mesmo quando o dia
            seguinte é domingo ou feriado. Não há capitalização diária adicional.
          </Item>
          <Item titulo="Recebimento">
            Somente Pix, com registro manual. Não há pagamento parcial nem integração bancária.
          </Item>
          <Item titulo="Data real x data de digitação">
            O cálculo e o painel usam a data em que o dinheiro entrou. A data e o horário da
            digitação ficam registrados à parte, no histórico.
          </Item>
          <Item titulo="Contratos simultâneos">
            Um cliente pode ter vários contratos abertos. Criar um novo empréstimo não encerra nem
            transfere o saldo do anterior.
          </Item>
        </Cartao>

        <Cartao titulo="Decisões provisórias do protótipo">
          <Item titulo="Cadastro de cliente">
            Só nome e telefone com DDD são obrigatórios. Os demais campos ficam em seções
            recolhíveis e podem ser preenchidos depois.
          </Item>
          <Item titulo="Arredondamento">
            Valores em centavos inteiros. Principal e juros são repartidos separadamente entre as
            parcelas por divisão inteira, e o resto é distribuído de um em um centavo nas primeiras
            parcelas. Assim a soma das parcelas fecha com o total, a soma dos principais fecha com o
            principal e a soma dos juros fecha com os juros.
          </Item>
          <Item titulo="Composição principal/juros por parcela">
            Como não existe pagamento parcial, cada parcela quitada transporta a composição inteira
            definida na geração. Acréscimo por atraso fica sempre fora dessa composição e é
            contabilizado à parte. Método a validar antes da produção.
          </Item>
          <Item titulo="Calendário semanal">
            Intervalos de sete dias contados a partir do primeiro vencimento. Vencimento em domingo
            ou feriado avança para o próximo dia permitido, e o ajuste não desloca as datas
            seguintes.
          </Item>
          <Item titulo="Calendário mensal">
            Mesmo dia do mês; quando o dia não existe, usa o último dia do mês. Mesma regra de
            avanço e de não-acúmulo do semanal.
          </Item>
          <Item titulo="Permissões do assistente">
            Cadastra clientes, consulta o necessário para cobrar e registra pagamentos. Não vê
            indicadores gerais, não cria contratos, não altera regras financeiras e não desfaz
            pagamentos.
          </Item>
          <Item titulo="Correção de pagamento">
            Apenas o proprietário desfaz. Exige motivo curto, preserva o lançamento original e
            registra a reversão com autor e horário.
          </Item>
        </Cartao>

        <Cartao titulo="Pendências antes da produção">
          <Item titulo="Atraso em semanal e mensal">
            A regra de dobra não foi estendida. Hoje o atraso é apenas identificado, sem acréscimo.
            Falta definir se há multa, juros de mora ou nada.
          </Item>
          <Item titulo="Feriados municipais">
            As leis municipais de Feira de Santana foram levantadas em fonte secundária, não no
            texto oficial. Feriados municipais eventuais, decretados ano a ano, não estão cobertos.
            Carnaval e Quarta-feira de Cinzas são ponto facultativo e entram desligados.
          </Item>
          <Item titulo="Contrato “Fixo”">
            Modalidade não incluída por falta de definição do funcionamento.
          </Item>
          <Item titulo="Autenticação, contas e isolamento">
            Perfis, operações e armazenamento local desta demonstração não são segurança. Em
            produção o isolamento tem de ser feito no servidor, com autenticação real.
          </Item>
          <Item titulo="Exclusão de clientes">
            Fora desta etapa. Não deve eliminar histórico financeiro.
          </Item>
          <Item titulo="Convite de assistente">
            Não há envio real de convite nem cadastro público nesta etapa.
          </Item>
        </Cartao>

        <Cartao titulo="Vocabulário dos indicadores">
          <Item titulo="Principal em aberto">
            Soma das partes de principal das parcelas ainda não pagas. Não é caixa nem lucro.
          </Item>
          <Item titulo="Total a receber">
            Soma do valor devido de todas as parcelas em aberto na data de referência, já com os
            acréscimos aplicados. Também não é lucro.
          </Item>
          <Item titulo="Recebido hoje">
            Soma dos pagamentos cuja data real de recebimento é a data de referência, independente
            de quando foram digitados.
          </Item>
        </Cartao>
      </div>
    </>
  )
}
