# Acordos — protótipo navegável de gestão de empréstimos

Demonstração funcional para validar fluxos com o cliente antes da implementação de produção.
Dados fictícios, persistidos apenas no navegador. Não há banco, autenticação, integração
bancária nem cobrança pelo uso.

## Como abrir

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Para conferir o resultado de impressão do extrato, use
o botão "Imprimir / PDF" na tela de extrato.

```bash
npm run build     # tsc + build de produção
npm run preview   # serve o build
npm test          # testes das regras financeiras e de calendário
```

Feito para celular entre 360 e 430 px de largura, com adaptação para computador
(navegação lateral a partir de 860 px).

## Ferramenta da demonstração

A faixa verde no topo mostra "Demonstração — dados fictícios" e a data de referência.
O botão **Ajustar demo** abre o painel que alterna:

- **Operação** — Operação Tomba (A) e Operação Centro (B), com dados totalmente separados.
- **Perfil** — Proprietário e Assistente da operação selecionada.
- **Data de referência** — vale como "hoje" em toda a demonstração. Começa em **11/09/2026**,
  fixa, para que os cenários continuem demonstráveis. Há atalhos de −1 dia, +1 dia e voltar
  à data inicial.
- **Restaurar** — recria o cenário inicial desta operação ou das duas.

Esses seletores simulam perfis e contas. **Não são autenticação nem isolamento de produção.**
O mesmo vale para o armazenamento local: os dados ficam no `localStorage` do navegador,
separados por identificador de operação apenas para a demonstração não misturar cenários.

## Fluxos disponíveis

| Área | O que dá para fazer |
| --- | --- |
| Início (proprietário) | Recebido hoje, pendente com vencimento hoje, total atrasado, quantidade pendente hoje, resumo da carteira (principal em aberto e total a receber) e lista do dia. Os cartões de cobrança levam à lista correspondente. |
| Início (assistente) | Lista de trabalho do dia e atalhos para cadastrar cliente e registrar Pix. Sem indicadores gerais. |
| Clientes | Busca por nome ou telefone, cadastro (nome e telefone obrigatórios; o resto em seções recolhíveis), ficha com abas Dados e Contratos, edição. |
| Contratos | Busca por cliente ou número, filtro de situação, criação em três passos (Cliente, Condições, Conferência), detalhe com parcelas e histórico, extrato. |
| Vencimentos | Filtros Hoje, Atrasados, Próximos e Pagos, com busca que preserva o filtro. Atrasados ordenados do vencimento mais antigo para o mais recente. |
| Pagamento | Painel com cliente e parcela, data real preenchida com a data da demonstração, alteração para data anterior, recálculo do valor devido nessa data, valor integral, Pix, confirmação e retorno à posição da lista. |
| Quitação antecipada | Só para o proprietário. Mostra as parcelas envolvidas e o total antes de confirmar. |
| Correção | Só para o proprietário. Exige motivo curto, preserva o lançamento original e registra a reversão com autor e horário. |
| Extrato | Cabeçalho, tabela de parcelas com valor original e acréscimo separados, vencimento e pagamento em colunas distintas, totais, contagens por situação, data de atualização e marca de demonstração. Impressão em A4 com cabeçalho de tabela repetido. |
| Mais | Identificação da operação, apresentação do acesso do assistente, calendário de feriados com procedência, restauração da demonstração e a tela "Regras e pendências". |

### Cenários prontos nos dados fictícios

Operação A: cliente sem contrato (Wesley), cliente com dois contratos abertos (Adriano,
contratos 101 diário e 102 semanal), contrato quitado (Railson, 104), parcelas vencendo hoje,
diárias atrasadas com o acréscimo único (Cleide, 103), parcela paga antecipadamente e
pagamento retroativo digitado dois dias depois (Marlene, 106), contrato mensal (Tatiane, 105).
Operação B tem clientes e contratos próprios, sem interseção com a operação A.

## Estrutura

```
src/
  domain/      regras puras, sem React
    dates.ts         datas civis AAAA-MM-DD, sem Date com fuso
    dinheiro.ts      centavos inteiros, repartição determinística
    feriados.ts      calendário de feriados com procedência
    calendario.ts    geração de vencimentos por frequência
    contratos.ts     montagem do contrato e das parcelas
    cobranca.ts      atraso, situação, quitação
    indicadores.ts   painéis e resumos derivados dos registros
  data/        dados fictícios e persistência local por operação
  state/       store da aplicação
  ui/          telas e componentes
```

Os cálculos ficam inteiramente em `src/domain` e são cobertos por testes. A interface só lê
resultados.

## Regras aplicadas

### Confirmadas

- **Juros**: a porcentagem incide uma única vez sobre o principal, para o contrato inteiro.
  R$ 1.000 com 40% → R$ 400 de juros, R$ 1.400 de total, 20 parcelas de R$ 70.
- **Calendário diário**: segunda a sábado contam; domingos não contam; feriados aplicáveis a
  Feira de Santana–BA não contam; a quantidade contratada de parcelas é sempre gerada.
- **Atraso na diária**: dobra uma única vez, no dia seguinte ao vencimento, e depois fica
  congelada. Cada diária é tratada isoladamente. O acréscimo ocorre inclusive quando o dia
  seguinte é domingo ou feriado. Sem capitalização adicional.
- **Recebimento**: só Pix, registro manual, sem pagamento parcial e sem pagamento futuro.
- **Data real x data de digitação**: cálculo e painel usam a data em que o dinheiro entrou;
  a data e a hora da digitação ficam no histórico.
- **Contratos simultâneos**: criar outro empréstimo não encerra nem transfere o saldo anterior.

### Decisões provisórias do protótipo

- Só nome e telefone com DDD são obrigatórios no cadastro de cliente.
- **Arredondamento**: principal e juros são repartidos separadamente entre as parcelas por
  divisão inteira, com o resto distribuído de um em um centavo nas primeiras parcelas. Com
  isso a soma das parcelas fecha com o total, a dos principais com o principal e a dos juros
  com os juros.
- **Composição principal/juros por parcela**: como não existe pagamento parcial, cada parcela
  quitada transporta a composição inteira definida na geração. Acréscimo por atraso fica
  sempre fora dessa composição e é contabilizado à parte.
- **Semanal**: intervalos de sete dias a partir do primeiro vencimento; vencimento em dia
  excluído avança para o próximo permitido; o ajuste não desloca as datas seguintes.
- **Mensal**: mesmo dia do mês, recuando para o último dia quando o dia não existe; mesma
  regra de avanço e de não-acúmulo.
- **Permissões do assistente**: cadastra clientes, consulta o necessário para cobrar e
  registra pagamentos; não vê indicadores gerais, não cria contratos, não altera regras
  financeiras e não desfaz pagamentos.
- **Correção de pagamento**: só o proprietário desfaz, com motivo curto, preservando o
  lançamento original.

### Pendências antes da produção

- **Atraso em semanal e mensal**: a regra de dobra não foi estendida. Hoje o atraso é apenas
  identificado, sem acréscimo. Falta definir se há multa, mora ou nada.
- **Feriados municipais**: as leis municipais de Feira de Santana (Sexta-feira da Paixão,
  Corpus Christi, São João em 24/06 e Senhora Sant'Ana em 26/07) foram levantadas em fonte
  secundária, não no texto legal publicado — confirmar. Feriados municipais eventuais,
  decretados ano a ano, não estão cobertos. Carnaval e Quarta-feira de Cinzas são ponto
  facultativo, não feriado legal, e entram desligados. Tudo isso está visível e editável em
  Mais › Calendário de cobrança.
- **Contrato "Fixo"**: não incluído, por falta de definição do funcionamento.
- **Autenticação, contas e isolamento**: precisam ser feitos no servidor.
- **Exclusão de clientes**: fora desta etapa; não deve eliminar histórico financeiro.
- **Convite de assistente**: não há envio real nesta etapa.

A mesma documentação está dentro do aplicativo, em **Mais › Regras e pendências**, para
percorrer junto com o cliente.

## O que foi verificado

`npm test` cobre, entre outros casos:

1. R$ 1.000 com 40% e 20 parcelas resulta em R$ 1.400 e parcelas de R$ 70.
2. Os arredondamentos preservam o total, o principal e os juros, inclusive com resto.
3. As diárias pulam domingo e feriado configurado e mantêm sábado, gerando exatamente a
   quantidade contratada; nenhum vencimento cai em dia excluído.
4. R$ 70 atrasados passam a R$ 140 uma única vez e não voltam a crescer, inclusive quando o
   dia seguinte é domingo. Semanal e mensal não recebem acréscimo.
5. Pagamento retroativo respeita a data real no cálculo e no painel: recebido no vencimento e
   digitado dois dias depois entra sem acréscimo, no dia do recebimento.
6. A mesma parcela não é paga duas vezes; cliques repetidos no botão geram um só lançamento.
7. Criar um contrato novo preserva parcelas e saldo do anterior.
8. As operações não misturam identificadores, clientes nem contratos.
9. O assistente não vê os indicadores restritos e é bloqueado na criação de contrato.
10. A reversão preserva o histórico, mantém o motivo e devolve o saldo.
11. O extrato fecha com as parcelas: soma das parcelas = total contratado, soma das pagas =
    total pago, soma das abertas = saldo, e as contagens fecham com a quantidade de parcelas.

Além dos testes, os fluxos foram percorridos no navegador em 360 px, 390 px e 1280 px:
nenhuma rolagem horizontal nas telas principais, criação de cliente no meio do contrato sem
perder o preenchimento, aviso de ajuste quando o primeiro vencimento cai em domingo,
registro de pagamento, quitação antecipada, reversão com motivo e impressão do extrato em A4
com o cabeçalho da tabela repetido nas páginas seguintes.

## Limitações

- Protótipo de demonstração. Os dados vivem no navegador e somem ao limpar o site.
- Perfis e operações não são segurança: qualquer pessoa com a página troca de perfil.
- Sem integração bancária, sem envio automático de mensagens, sem consulta externa de
  documentos, endereço ou placa.
- O extrato é operacional. Não é contrato, não tem cláusulas jurídicas nem assinatura.
- A escolha de React + TypeScript + Vite serve ao protótipo e não fecha a arquitetura de
  produção.
