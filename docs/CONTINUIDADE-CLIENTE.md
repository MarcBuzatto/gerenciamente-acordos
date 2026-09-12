# Continuidade — entrega consolidada

Este documento é o ponto de entrada para quem for continuar o projeto numa
sessão local do Claude Code, incluindo a mudança para o repositório do cliente e
a configuração de Vercel e Supabase.

Leia isto primeiro. Os detalhes operacionais estão em
[`INTEGRACAO.md`](INTEGRACAO.md) e o roteiro passo a passo de ligação da
homologação em [`SESSAO-LOCAL.md`](SESSAO-LOCAL.md).

---

## Invariantes — o que não muda

Estas regras valem para qualquer sessão futura. Não são preferências.

- **O sistema é gratuito.** Não existem planos, assinaturas, checkout, cobrança
  pelo uso, período de teste ou limites comerciais. Nada disso deve ser
  adicionado.
- **MFA por aplicativo autenticador é obrigatório.** O TOTP continua exigido
  para qualquer acesso a dados de operação.
- **Não reduzir a exigência de `aal2`.** Não existe mecanismo de rebaixamento no
  código, e não deve passar a existir. A conferência 12 de
  `supabase/tests/02_conformidade.sql` falha se `app.tem_aal2()` passar a
  depender de configuração ajustável. O plano Free do Supabase inclui "Basic
  Multi-Factor Auth" (TOTP), que é o que usamos; o restrito ao plano pago é
  "Advanced MFA — Phone", que não usamos.
- **Nenhum dado real antes da validação.** Nada de cliente real em homologação,
  nem migração dos contratos do sistema atual, enquanto a validação financeira
  não estiver concluída.
- **Não declarar funcionalidade verificada só porque passou no harness local.**
  O harness roda num PostgreSQL comum que imita a plataforma. Ele prova o
  comportamento do banco; não prova o comportamento do GoTrue, do PostgREST, da
  entrega de e-mail nem do MFA real. Enquanto um fluxo não for executado contra
  o Supabase real, o relatório deve dizer isso com todas as letras.

---

## 1. Estado real da implementação

| Área | Estado |
| --- | --- |
| Protótipo navegável (telas, fluxos, extrato) | pronto e validado com o cliente |
| Migrações do banco (4 arquivos) | escritas e testadas em PostgreSQL 16 local e no CI |
| RLS, privilégios e funções transacionais | escritas e testadas localmente |
| Autenticação, TOTP, convites, recuperação de senha | implementados; **não exercitados no serviço real** |
| Frontend integrado | compila, roda e trata carga/erro/permissão |
| Modo demonstração | preservado e funcionando |
| Testes | 79 passando (45 sem banco + 34 de integração) |
| Conformidade de esquema | 13 conferências |
| **Supabase real** | **nada aplicado, nada validado** |
| **Publicação** | **não existe** |
| Migração para o repositório do cliente | **não iniciada** |

Por que nada foi ligado: a sessão remota onde o projeto foi construído não
alcança o Supabase — o gateway de rede responde 403 ao CONNECT para
`supabase.com`, `api.supabase.com` e `*.supabase.co`. Isso é política do
ambiente e não foi contornado.

---

## 2. Branch consolidada e relação entre os PRs

**Branch única com tudo: `claude/supabase-integration-2y5yna`.**

Ela já contém o protótipo: a branch foi criada a partir de
`claude/loan-management-prototype-2y5yna`, então o commit do protótipo é
ancestral direto. Não é preciso juntar nada à mão.

```
d96d1a4  Protótipo navegável de gestão de empréstimos          ← PR #1
ed77fed  Integra o sistema ao Supabase com autorização no banco ← PR #2
ce05ffc  Prepara a ligação com o Supabase real e endurece a verificação
57a0677  Corrige a premissa sobre MFA e remove o rebaixamento de aal2
```

| PR | Branch | Base | Estado |
| --- | --- | --- | --- |
| #1 | `claude/loan-management-prototype-2y5yna` | `main` | draft, **sem merge** |
| #2 | `claude/supabase-integration-2y5yna` | branch do #1 | draft, **sem merge** |

`main` continua só com o commit inicial. Os dois PRs seguem abertos como draft,
sem merge, de propósito — são o registro da revisão.

Para baixar tudo, uma branch basta:

```bash
git clone --branch claude/supabase-integration-2y5yna \
  https://github.com/MarcBuzatto/gerenciamente-acordos.git
```

Clonar assim preserva o histórico completo, que é o que interessa para a
migração descrita na seção 9.

---

## 3. Instalar, executar e testar

```bash
npm install

npm run dev         # aplicação integrada — exige .env.local
npm run dev:demo    # demonstração com dados fictícios, sem login
npm run build
npm test
```

Verificado num checkout limpo (`git archive` da branch, `npm ci`): typecheck,
build e testes passam sem nenhum arquivo fora do repositório.

### Testes

```bash
npm test
```

- **Sem PostgreSQL disponível:** 45 passam, 34 são pulados com aviso explícito
  no console. Pulado não é aprovado — o aviso existe justamente para isso.
- **Com PostgreSQL:** 79 passam.

```bash
./scripts/db-local.sh    # recria um banco local com todas as migrações
npm test                 # agora os 34 de integração também rodam

psql "$TEST_DATABASE_URL" -f supabase/tests/01_dominio.sql    # paridade SQL × TS
psql "$TEST_DATABASE_URL" -f supabase/tests/02_conformidade.sql  # segurança do esquema
```

`db-local.sh` precisa de um PostgreSQL 16 acessível. Ele não usa Docker, então
funciona onde `supabase start` não roda.

---

## 4. Demonstração

```bash
npm run dev:demo
```

Dados fictícios no navegador, sem login e sem servidor. Traz o painel "Ajustar
demo" para alternar perfil (proprietário/assistente), operação (A/B) e data de
referência, além de restaurar o cenário.

Nada disso existe na aplicação integrada: lá não há seletor de perfil, não se
troca para operação sem vínculo, a data vem do servidor e não há restauração de
cenário. Os dados da demonstração **não** são carregados para o banco em momento
algum.

---

## 5. Variáveis: o que é público e o que é segredo

### Público — pode ir para `.env.local`, para a Vercel e para o bundle

| Variável | Onde obter |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → Data API |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API Keys → anon/publishable |
| `VITE_URL_APLICACAO` | a URL do ambiente publicado |
| `VITE_MODO` | `demo` liga a demonstração; vazio na integrada |

Tudo com prefixo `VITE_` entra no JavaScript servido ao navegador. É por isso
que só valor público pode ficar aí.

### Secreto — nunca em `VITE_*`, nunca versionado, nunca em log ou URL de remote

| Acesso | Para quê | Como fornecer |
| --- | --- | --- |
| Senha do banco Supabase | `supabase db push`, psql | `read -rsp` no shell, ou gerenciador de senhas |
| `service_role` do Supabase | administração pelo servidor | **não é usada nesta aplicação** |
| Token do Supabase (`sbp_…`) | CLI | `npx supabase login` — fluxo oficial pelo navegador |
| Token do GitHub | push no repositório do cliente | `gh auth login` — fluxo oficial |
| Token da Vercel | deploy | `vercel login` — fluxo oficial |

Exemplo de como passar a senha do banco sem deixar rastro no histórico:

```bash
read -rsp 'URL do banco: ' SUPABASE_DB_URL && export SUPABASE_DB_URL && echo
./scripts/conferir-destino.sh
```

`.gitignore` já cobre `.env`, `.env.local`, `node_modules`, `dist` e
`tsconfig.tsbuildinfo`. Os únicos arquivos de ambiente versionados são
`.env.example` (só marcadores) e `.env.demo` (só `VITE_MODO=demo`).

---

## 6. O que foi testado localmente

Contra um PostgreSQL 16 com **as mesmas migrações** que irão para o Supabase, e
no CI do GitHub com um PostgreSQL efêmero.

**Domínio (38 testes)** — juros de taxa única, arredondamento fechando total,
principal e juros, calendário diário pulando domingo e feriado e mantendo
sábado, dobra única do atraso, pagamento retroativo, parcela não paga duas
vezes, contratos simultâneos, reversão preservando histórico, extrato fechando
com as parcelas.

**Classificação de erros (7)** — falha de rede vira "sem conexão, nada foi
salvo"; sessão expirada, falta de permissão, conflito e entrada inválida têm
tratamento próprio. É o que impede um falso sucesso na tela.

**Integração com o banco (34)** — direto nas tabelas e nas RPC, com cinco
identidades (proprietário A, assistente A, proprietário B, usuário sem vínculo,
sessão anônima): isolamento entre operações inclusive trocando IDs no payload;
assistente sem acesso a contratos, parcelas, pagamentos, auditoria e
indicadores, sem promover o próprio papel e sem reverter pagamento; sessão
anônima sem acesso; **sessão em `aal1` recusada pelo banco**; revogação valendo
na consulta seguinte com sessão aberta; convite só aceito pelo destinatário e
guardado como hash; contrato e parcelas atômicos; duas sessões simultâneas na
mesma parcela gerando um único recebimento; reenvio idempotente; retroativo
mantendo data e valor; quitação e reversão com auditoria; indicadores e extrato
reconciliando; histórico impossível de apagar ou adulterar.

**Conformidade de esquema (13 conferências)** — RLS em todas as tabelas, `anon`
sem privilégio nenhum, sem escrita direta em tabela financeira, sem `DELETE`
para a aplicação, `search_path` fixo em toda função `SECURITY DEFINER`, funções
internas fora do alcance do usuário, nenhuma função manipulando claims de JWT,
chaves estrangeiras compostas com `operacao_id`, índice único parcial impedindo
dois pagamentos ativos na mesma parcela, gatilhos de bloqueio de exclusão, e
`aal2` sem porta dos fundos. Testado que o script **pega regressão de verdade**:
desligar a RLS de uma tabela o faz falhar nomeando a tabela.

**No navegador** — demonstração completa em 360, 390 e 1280 px; tela de acesso
comunicando falha de conexão sem declarar sucesso; assistente sem Contratos na
navegação nem indicadores.

### O que isso não prova

O harness imita a plataforma: recria os papéis `anon`/`authenticated`/
`service_role`, a tabela `auth.users` e as funções `auth.uid()`/`auth.jwt()`, e
reproduz os privilégios padrão que o Supabase concede. É fiel o bastante para
validar o banco — e **só o banco**. Não passa por GoTrue, PostgREST, entrega de
e-mail nem MFA real.

---

## 7. O que ainda NÃO foi testado no Supabase real

Nada foi. Em particular:

- Cadastro de conta e confirmação de e-mail.
- Login, logout e expiração de sessão.
- Cadastro e verificação do segundo fator (TOTP) no serviço real.
- Bloqueio efetivo antes de atingir `aal2` pela API do PostgREST.
- Convite de assistente e aceite pelo destinatário.
- Revogação de assistente com sessão aberta, via API real.
- Recuperação e redefinição de senha.
- Todos os fluxos financeiros ponta a ponta contra o banco hospedado.
- Isolamento entre operações verificado por chamadas HTTP diretas.
- Comportamento no Safari do iPhone, incluindo links abertos em aba nova.
- Compatibilidade das migrações com o Supabase real (`db push`, extensões,
  permissões do papel `postgres` da plataforma).

O roteiro para executar tudo isso está em [`SESSAO-LOCAL.md`](SESSAO-LOCAL.md).

---

## 8. Pendências

### Autenticação

- Ciclo completo de recuperação do segundo fator. A API `auth.mfa.recoveryCodes`
  está marcada como **experimental** no SDK instalado. Enquanto não for
  confirmada e testada, o caminho garantido é a remoção administrativa do fator
  — com o procedimento de verificação de identidade descrito em
  [`INTEGRACAO.md`](INTEGRACAO.md), seção 7.

### E-mail

- O SMTP padrão do Supabase é de desenvolvimento: poucos e-mails por hora e
  entrega não garantida. Confirmação de cadastro e recuperação de senha dependem
  disso. Configurar SMTP próprio antes de qualquer uso real. Não inventar
  remetente nem contratar serviço pago sem autorização.

### Regras financeiras

- **Atraso em contratos semanais e mensais:** a dobra da diária não foi
  estendida. Hoje o atraso é apenas identificado, sem acréscimo. Falta decidir
  se há multa, mora ou nada.
- **Feriados municipais de Feira de Santana:** levantados em fonte secundária,
  não no texto legal publicado. Feriados eventuais decretados ano a ano não
  estão cobertos. Carnaval e Quarta-feira de Cinzas são ponto facultativo e
  entram desligados. Cada operação tem a própria lista, editável na tela Mais.
- **Composição principal/juros por parcela:** principal e juros são repartidos
  separadamente, cada um com divisão inteira e resto de um centavo nas primeiras
  parcelas. Fecha por construção, mas o método precisa ser validado com o
  cliente.
- Modalidade "Fixo", descontos, renegociação e pagamento parcial seguem **fora
  do escopo**.

### Backup

- **Não está feito.** Existe comando de exportação; faltam automação, retenção,
  armazenamento externo e um teste de restauração completo. Existir um `db dump`
  não é backup.

### Migração de dados

- Os contratos existentes do sistema atual do cliente **não** foram migrados, e
  não devem ser antes da validação financeira. Enquanto não houver um fluxo
  explícito de migração, o servidor recusa pagamento anterior à data de início
  do contrato — o que é correto, mas impede importar histórico.

---

## 9. Mudança para o GitHub do cliente

A próxima sessão fará isso. Ordem obrigatória:

1. **Confirmar proprietário e endereço do repositório de destino** com o
   usuário, por escrito. Não inferir a partir de nome parecido.
2. **Verificar o destino antes de escrever:** ele está vazio ou já tem trabalho?
   ```bash
   gh repo view OWNER/REPO --json name,owner,visibility,defaultBranchRef,isEmpty
   git ls-remote https://github.com/OWNER/REPO.git | head
   ```
   Se houver commits, **parar e combinar** como preservá-los. Nunca sobrescrever.
3. **Preservar o histórico Git.** Clonar com histórico (não baixar ZIP e
   recomeçar) e enviar a branch consolidada inteira.
4. **Manter referência à origem**, se fizer sentido: adicionar o repositório
   atual como um remote extra (`git remote add origem …`) e registrar no README
   de onde o projeto veio.
5. **Enviar sem sobrescrever:**
   ```bash
   git remote add cliente https://github.com/OWNER/REPO.git
   git push cliente claude/supabase-integration-2y5yna
   ```
   **Sem `--mirror`, sem `--force`, sem `-f`.** `push --mirror` copia todas as
   referências e pode apagar o que existe no destino.
6. **Reconfigurar a publicação e as integrações** apontando para o novo
   repositório.

### O que copiar commits NÃO leva junto

Isto precisa ser recriado à mão no destino, e é fonte comum de confusão:

- Pull requests e suas discussões.
- Secrets e variables de Actions.
- Permissões, colaboradores e times.
- Configurações de branch protection.
- Webhooks e GitHub Apps instalados.
- A ligação do projeto na Vercel (que aponta para um repositório específico).
- Configuração e dados de qualquer projeto Supabase.

### Contas possivelmente diferentes

GitHub, Vercel e Supabase podem estar em **contas ou equipes distintas**. Antes
de criar ou alterar qualquer recurso, confirmar em qual conta/equipe ele vai
nascer — e confirmar com o usuário. Não criar projeto em conta pessoal quando o
destino é uma organização, nem o contrário.

---

## 10. Configurar homologação e publicar

Roteiro completo, com as travas de segurança, em
[`SESSAO-LOCAL.md`](SESSAO-LOCAL.md). Em resumo:

1. Criar projeto Supabase no plano Free.
2. `npx supabase login` (navegador) e `link --project-ref`.
3. **Conferir o destino** com `./scripts/conferir-destino.sh` — ele inspeciona o
   banco inteiro, não só `auth.users`, e dá um veredito. `auth.users` vazio não
   prova banco vazio.
4. `npx supabase db push --dry-run`, revisar, e só então `db push`.
5. `npx supabase config diff`, revisar item a item, e só então `config push`
   — ele **sobrescreve** a configuração remota de auth.
6. `./scripts/verificar-homologacao.sh` e `npx supabase db advisors --type security`.
7. `.env.local` com os três valores públicos, `npm run dev`, e executar o
   roteiro de validação funcional.
8. `npm run build` e publicar em hospedagem estática gratuita.
9. **Depois de publicar:** acrescentar a URL em Authentication → URL
   Configuration (`Site URL` e `Redirect URLs`, incluindo `/**`). Sem isso,
   confirmação de e-mail, recuperação de senha e convite não voltam para a
   aplicação.
10. Conferir no iPhone: atualizar página interna, abrir link de convite e de
    recuperação pelo Safari.

---

## 11. Limitações conhecidas

- Homologação, não produção. Não liberado para dinheiro real.
- Sem integração bancária. Pix é registrado manualmente.
- Sem envio automático de mensagem, e-mail ou WhatsApp. O convite é um link que
  o proprietário repassa.
- Sem consulta externa de CPF/CNPJ, CEP ou placa.
- O extrato é operacional: não é contrato, não tem cláusula jurídica nem
  assinatura.
- Sem exclusão de cliente: o histórico financeiro é imutável por construção
  (gatilhos recusam `DELETE`).
- Dinheiro em `BIGINT` de centavos limitado por `CHECK` a R$ 9.999.999.999,99,
  para não perder precisão na serialização JSON do JavaScript.
- No modo demonstração os dados vivem no navegador e somem ao limpar o site;
  perfis e operações ali não são segurança.
- A escolha de React + TypeScript + Vite atende ao escopo atual e não foi
  revisada para volumes muito maiores.
