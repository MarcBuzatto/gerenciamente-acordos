# Acordos — gestão de empréstimos

Sistema gratuito de gestão de empréstimos, com contas independentes e dados
separados por operação. Roda em dois modos:

- **Integrado** — Supabase (PostgreSQL + autenticação), login com verificação em
  duas etapas e permissões aplicadas no banco. É o que vira o sistema real.
- **Demonstração** — o protótipo aprovado, com dados fictícios no navegador,
  para demonstrar fluxos e testar usabilidade. Sem login e sem servidor.

Esta etapa entrega a versão integrada em **homologação**. Ainda não foi liberada
para controlar dinheiro real — as pendências estão em
[`docs/INTEGRACAO.md`](docs/INTEGRACAO.md).

## Como abrir

```bash
npm install

npm run dev         # integrado — exige .env.local (veja .env.example)
npm run dev:demo    # demonstração com dados fictícios, sem login
```

Abre em `http://localhost:5173`. Para conferir o resultado de impressão do extrato, use
o botão "Imprimir / PDF" na tela de extrato.

```bash
npm run build       # tsc + build de produção
npm run build:demo  # build da demonstração
npm run preview     # serve o build
npm test            # domínio, classificação de erros e integração com o banco
npm run db:local    # recria um PostgreSQL local com todas as migrações
npm run db:push     # aplica as migrações no projeto Supabase vinculado
```

Os testes de banco são pulados com aviso quando não há PostgreSQL disponível;
`npm run db:local` sobe um e os habilita.

## Configuração e operação

Variáveis, migrações, teste de permissões, separação entre ambientes,
recuperação do segundo fator, ensaio de exportação/restauração e pendências:
**[`docs/INTEGRACAO.md`](docs/INTEGRACAO.md)**.

Feito para celular entre 360 e 430 px de largura, com adaptação para computador
(navegação lateral a partir de 860 px).

## Ferramenta da demonstração (só no modo demo)

No modo demonstração, a faixa verde no topo mostra "Demonstração — dados
fictícios" e a data de referência, e o botão **Ajustar demo** abre o painel que
alterna:

- **Operação** — Operação Tomba (A) e Operação Centro (B), com dados totalmente separados.
- **Perfil** — Proprietário e Assistente da operação selecionada.
- **Data de referência** — vale como "hoje" em toda a demonstração. Começa em **11/09/2026**,
  fixa, para que os cenários continuem demonstráveis. Há atalhos de −1 dia, +1 dia e voltar
  à data inicial.
- **Restaurar** — recria o cenário inicial desta operação ou das duas.

Esses seletores simulam perfis e contas. **Não são autenticação nem isolamento de produção.**
O mesmo vale para o armazenamento local: os dados ficam no `localStorage` do navegador,
separados por identificador de operação apenas para a demonstração não misturar cenários.

Nada disso existe na aplicação integrada: lá não há seletor de perfil, não há
como trocar para uma operação sem vínculo, não há restauração de cenário, não
entram dados fictícios e a data das transações vem do servidor.

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
  data/        api.ts (acesso ao Supabase), dados fictícios e persistência local
  lib/         cliente do Supabase
  state/       loja.ts (interface das telas) + provedor demo e provedor integrado
  servidor/    testes de integração com o banco
  ui/          telas e componentes
supabase/
  migrations/  esquema, domínio em SQL, RLS e funções transacionais
  tests/       bootstrap local e paridade das regras em SQL
```

Os cálculos ficam em `src/domain` e são cobertos por testes. A interface só lê
resultados. No modo integrado, **o servidor é quem determina os valores**: as
mesmas regras existem em SQL (`supabase/migrations/…_dominio.sql`), e um teste
confere que as duas implementações concordam.

As telas consomem uma interface única (`src/state/loja.ts`), implementada pelo
provedor de demonstração e pelo provedor integrado. Foi isso que permitiu
preservar os fluxos aprovados ao ligar o banco.

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

`npm test` — 78 testes, em três frentes.

**Domínio (38)** — as regras financeiras e de calendário, em TypeScript:

1. R$ 1.000 com 40% e 20 parcelas resulta em R$ 1.400 e parcelas de R$ 70.
2. Os arredondamentos preservam o total, o principal e os juros, inclusive com resto.
3. As diárias pulam domingo e feriado configurado e mantêm sábado, gerando exatamente a
   quantidade contratada; nenhum vencimento cai em dia excluído.
4. R$ 70 atrasados passam a R$ 140 uma única vez e não voltam a crescer, inclusive quando o
   dia seguinte é domingo. Semanal e mensal não recebem acréscimo.
5. Pagamento retroativo respeita a data real no cálculo e no painel.
6. A mesma parcela não é paga duas vezes.
7. Criar um contrato novo preserva parcelas e saldo do anterior.
8. A reversão preserva o histórico e devolve o saldo; o extrato fecha com as parcelas.

**Erros da API (7)** — falha de rede vira "sem conexão, nada foi salvo", nunca um
sucesso silencioso; sessão expirada, falta de permissão, conflito e entrada
inválida têm mensagens próprias.

**Integração com o banco (33)** — batendo direto nas tabelas e nas RPC, com cinco
identidades (proprietário A, assistente A, proprietário B, usuário sem vínculo e
sessão anônima):

1. Uma operação não lê nem altera registros de outra, e um cliente não pode ser movido.
2. Trocar IDs no payload não dá acesso cruzado — nem na RPC, nem apontando para
   parcela ou cliente de outra operação.
3. O assistente não lê contratos, parcelas, pagamentos nem auditoria, e a função de
   indicadores o recusa. A projeção que ele recebe não tem principal, juros, taxa nem totais.
4. O assistente não promove o próprio papel, não convida e não revoga membros.
5. Sessão anônima não acessa nada.
6. Sessão em `aal1` (sem segundo fator) não acessa dados da operação; a revogação de
   acesso vale já na consulta seguinte, com a sessão aberta; convite só é aceito pelo
   destinatário e o banco guarda apenas o hash do token.
7. Contrato e parcelas são criados atomicamente, e um contrato inválido não deixa parcela órfã.
8. Duas sessões simultâneas na mesma parcela geram um único recebimento válido.
9. Reenvio com a mesma chave de idempotência não duplica lançamento.
10. Pagamento retroativo mantém data e valor; pagamento futuro e anterior ao contrato são recusados.
11. O atraso da diária dobra uma vez.
12. Quitação e reversão preservam integridade e auditoria, e a parcela revertida aceita
    um novo pagamento válido.
13. Indicadores e extrato reconciliam com contratos, parcelas e pagamentos.
14. Histórico financeiro não pode ser apagado nem ter valores ou autoria adulterados.

O arquivo `supabase/tests/01_dominio.sql` repete os mesmos casos objetivos **em SQL**,
garantindo que o cálculo do servidor e o do domínio em TypeScript não divirjam.

Além dos testes, os fluxos foram percorridos no navegador em 360, 390 e 1280 px, nos dois
modos: sem rolagem horizontal nas telas principais, registro de pagamento, criação de
cliente no meio do contrato sem perder o preenchimento, aviso de ajuste quando o primeiro
vencimento cai em domingo, impressão do extrato em A4 com cabeçalho repetido, tela de acesso
comunicando falha de conexão sem declarar sucesso, e o assistente sem Contratos na navegação
nem indicadores na tela.

## Limitações

- Esta etapa é de **homologação**. Não foi liberada para dinheiro real e não migra dados.
- Backup de produção **não** está feito: existe comando de exportação, faltam automação,
  retenção, armazenamento externo e teste de restauração.
- A entrega de e-mail depende de SMTP próprio; sem isso, confirmação de cadastro e
  recuperação de senha ficam limitadas ao SMTP de desenvolvimento do Supabase.
- A recuperação do segundo fator depende de confirmação no projeto (ver
  [`docs/INTEGRACAO.md`](docs/INTEGRACAO.md), seção 7).
- Sem integração bancária, sem envio automático de mensagens, sem consulta externa de
  documentos, endereço ou placa.
- O extrato é operacional. Não é contrato, não tem cláusulas jurídicas nem assinatura.
- No modo demonstração os dados vivem no navegador e somem ao limpar o site; perfis e
  operações ali não são segurança.
