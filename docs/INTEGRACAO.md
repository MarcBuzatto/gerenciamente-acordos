# Integração com Supabase — homologação

Documento operacional desta etapa: o que é preciso para rodar, como aplicar as
migrações, como testar as permissões e o que ainda falta antes de qualquer uso
com dinheiro real.

Esta etapa **não** foi liberada para produção e **não** migra dados reais.

---

## 0. Estado atual: o que está conectado

**Nada aponta para um Supabase real ainda.** Tudo que está descrito aqui foi
construído e testado contra um PostgreSQL 16 local com as mesmas migrações, e
o que falta para ligar depende de ações que só você pode fazer.

Dois bloqueios, independentes um do outro:

1. **Rede.** O ambiente onde este trabalho roda bloqueia a saída para
   `supabase.com`, `api.supabase.com` e `*.supabase.co` (o gateway responde 403
   ao CONNECT). A CLI do Supabase, o `db push` e o navegador daqui não alcançam
   o serviço. Isso não afeta você: do seu computador e do seu iPhone o acesso é
   normal.
2. **Credenciais.** Não há token de acesso do Supabase nesta sessão, e pedir que
   você cole senha ou chave administrativa numa conversa seria errado. O
   `supabase login` e o `db push` precisam rodar na sua máquina.

Há ainda um ponto de plano a decidir: **a verificação em duas etapas do Supabase
é recurso do plano Pro** — é o que diz o template oficial de `config.toml` da
CLI ("Multi-factor-authentication is available to Supabase Pro plan"). Não
consegui abrir a documentação online daqui para confirmar se isso continua
valendo hoje. Num projeto gratuito, se o cadastro do segundo fator falhar, use o
ajuste da seção 4.1 — ele libera a homologação sem afrouxar isolamento nem
papéis.

---

## 1. Variáveis

O frontend usa apenas valores públicos. Copie `.env.example` para `.env.local`:

| Variável | Onde encontrar | Observação |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → Data API | público |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API Keys → anon/publishable | público |
| `VITE_URL_APLICACAO` | a URL do ambiente | base dos links de e-mail e convite |
| `VITE_MODO` | — | `demo` liga o protótipo fictício; vazio na integrada |

**A chave `service_role` nunca entra em variável `VITE_*`.** Tudo com esse
prefixo vai para o bundle e fica visível para qualquer pessoa que abra a página.
Nenhum fluxo desta etapa precisa dela no navegador: o convite de assistente é
gerado por função no banco (`criar_convite`), que só o proprietário autenticado
executa, e o token em claro só existe no link — o banco guarda o hash SHA-256.

Para aplicar migrações pela CLI você vai precisar da senha do banco do projeto
(Project Settings → Database). Ela fica na sua máquina, nunca no repositório.

---

## 2. Aplicar as migrações

As migrações estão em `supabase/migrations/`, versionadas e idempotentes na
ordem:

| Arquivo | Conteúdo |
| --- | --- |
| `…000100_esquema.sql` | tabelas, tipos, restrições, índices, bloqueio de exclusão |
| `…000200_dominio.sql` | feriados, calendário, repartição de centavos, atraso |
| `…000300_rls.sql` | privilégios, helpers de papel e Row Level Security |
| `…000400_rpc.sql` | funções transacionais e projeções autorizadas |
| `…000500_politica_autenticacao.sql` | nível de autenticação exigido, por ambiente |

### Roteiro para ligar a homologação

Tudo abaixo roda **na sua máquina**. Nenhum passo pede que você cole senha ou
chave em conversa nenhuma.

```bash
git clone https://github.com/MarcBuzatto/gerenciamente-acordos.git
cd gerenciamente-acordos
git checkout claude/supabase-integration-2y5yna
npm install
```

1. **Criar o projeto** em supabase.com → New project, plano **Free**. Nome
   sugerido: `acordos-homologacao`. Região `South America (São Paulo)`. Guarde a
   senha do banco no seu gerenciador de senhas — ela não vai para o repositório.
2. **Confirmar que o destino está certo e vazio.** Antes de qualquer push, no
   SQL Editor do painel:
   ```sql
   select current_database(), current_user;
   select count(*) from auth.users;          -- deve ser 0
   select count(*) from information_schema.tables where table_schema = 'public';
   ```
   Se aparecer tabela de outro projeto ou usuário já cadastrado, **pare**: o
   destino está errado.
3. **Aplicar as migrações:**
   ```bash
   npx supabase login          # abre o navegador, não pede senha aqui
   npx supabase link --project-ref SEU_REF
   npx supabase db push
   npx supabase config push    # aplica o auth de supabase/config.toml
   ```
4. **Verificar o que chegou** (este script não pede a URL na linha de comando,
   para a senha não ficar no histórico do shell):
   ```bash
   read -rsp 'URL do banco: ' SUPABASE_DB_URL && export SUPABASE_DB_URL && echo
   ./scripts/verificar-homologacao.sh
   ```
   Ele mostra o destino, a contagem de registros, as migrações aplicadas e roda
   as 14 conferências de conformidade (RLS, privilégios, funções, gatilhos,
   chaves compostas, nível de autenticação). Se o TOTP não estiver disponível no
   plano, veja a seção 4.1 e rode
   `./scripts/verificar-homologacao.sh homologacao`.
5. **Configurar o `.env.local`** com a URL do projeto e a chave anônima
   (Project Settings → Data API e API Keys) e subir a aplicação:
   ```bash
   cp .env.example .env.local   # edite os três valores
   npm run dev
   ```

### No projeto de homologação, resumido

```bash
npx supabase login
npx supabase link --project-ref SEU_REF
npx supabase db push
```

### Localmente, sem Docker

`supabase start` precisa de Docker. Sem ele, dá para rodar as mesmas migrações
num PostgreSQL comum — é assim que os testes deste repositório funcionam:

```bash
./scripts/db-local.sh            # recria o banco acordos_test e aplica tudo
psql "$TEST_DATABASE_URL" -f supabase/tests/01_dominio.sql
```

O `supabase/tests/00_bootstrap_local.sql` recria só o que a plataforma forneceria
(papéis `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()`,
`auth.jwt()`). **Ele nunca é aplicado num projeto Supabase.**

---

## 3. Rodar a aplicação

```bash
npm install
npm run dev         # aplicação integrada (exige .env.local)
npm run dev:demo    # protótipo com dados fictícios, sem login
npm test            # domínio + classificação de erros + integração com o banco
npm run build
```

Os testes de integração são pulados com aviso quando não há banco em
`TEST_DATABASE_URL` — o CI sobe um PostgreSQL efêmero e os executa.

### Configuração no painel do Supabase

1. **Authentication → URL Configuration**: `Site URL` e `Redirect URLs` precisam
   incluir a URL do ambiente (`http://localhost:5173` em desenvolvimento e a URL
   de homologação). Sem isso, o link de confirmação de e-mail e o de redefinição
   de senha não voltam para a aplicação — inclusive no Safari do iPhone, onde o
   link abre numa aba nova.
2. **Authentication → Providers → Email**: manter a confirmação de e-mail ligada.
3. **Authentication → Multi-Factor Authentication**: habilitar TOTP (app
   autenticador).

---

## 4. Testar autenticação e permissões

### Pelo navegador

1. Criar conta → confirmar e-mail → entrar.
2. A aplicação leva direto ao cadastro do segundo fator: ler o QR Code num app
   autenticador e informar os seis dígitos. **Antes disso nenhum dado de operação
   é liberado** — não é a tela que bloqueia, é o banco.
3. Criar a operação (ela nasce vazia; nenhum dado de exemplo é inserido).
4. Em **Mais → Equipe**, gerar um convite e abrir o link em outra conta.
5. Conferir que o assistente não vê Contratos na navegação, nem indicadores.

### 4.1 Nível de autenticação exigido (plano gratuito sem MFA)

Por padrão, **nenhum dado de operação é liberado sem `aal2`** — sessão que
passou pela verificação em duas etapas. Se o projeto de homologação estiver num
plano em que o TOTP não pode ser cadastrado, ninguém alcança dado nenhum e o
ambiente fica impossível de validar.

Para esse caso existe `public.politica_autenticacao`, com uma linha só:

```sql
-- SQL Editor do painel, ou psql. Não é alcançável pela aplicação.
update public.politica_autenticacao
   set nivel_exigido = 'aal1',
       motivo = 'homologacao no plano gratuito, sem MFA disponivel';
```

Três coisas mantêm isso honesto:

- **O padrão é `aal2`.** Quem não mexe fica no comportamento seguro.
- **A tabela é inalcançável pela API**: RLS ligada, nenhuma política, nenhum
  privilégio. Nem proprietário, nem assistente, nem sessão anônima leem ou
  escrevem. Só muda com acesso direto ao banco.
- **O script de conformidade falha** quando o nível está em `aal1`, a menos que
  a execução declare `homologacao` — e mesmo assim imprime um aviso.

Relaxar o segundo fator **não** relaxa mais nada: isolamento entre operações,
papéis, recusa de sessão anônima e restrições do assistente continuam valendo
igual. Isso é verificado por teste (`6f` em `src/servidor/__tests__/banco.test.ts`).

Antes de qualquer uso real, voltar para `aal2`:

```sql
update public.politica_autenticacao set nivel_exigido = 'aal2', motivo = null;
```

### Direto na API

O que vale é o que o banco recusa, não o que a tela esconde. Os testes em
`src/servidor/__tests__/banco.test.ts` batem direto nas tabelas e nas RPC, com
cinco identidades: proprietário A, assistente A, proprietário B, usuário sem
vínculo e sessão anônima.

```bash
./scripts/db-local.sh && npm test
```

Para repetir manualmente contra a homologação, use a chave anônima e um token de
usuário real; nunca a `service_role`.

---

## 5. Separação entre demonstração, homologação e produção

| | Demonstração | Homologação | Produção |
| --- | --- | --- | --- |
| Dados | fictícios, no navegador | fictícios, no Supabase | reais |
| Login | não tem | real, com 2FA | real, com 2FA |
| Painel de perfil/data | sim | **não** | **não** |
| Restaurar cenário | sim | **não** | **não** |
| Como rodar | `npm run dev:demo` | `npm run dev` + `.env.local` | não liberada |

Na aplicação integrada não existe seletor de proprietário/assistente, não há
como trocar para uma operação sem vínculo, não há botão de restaurar cenário e a
data das transações vem do servidor (`data_da_operacao`), no fuso da operação —
o relógio do aparelho não decide nada.

Os dados do protótipo que estejam no `localStorage` **não** são carregados para o
banco. Não há importação automática, de propósito.

### Sementes de teste

Não há semente automática. Para ensaiar em homologação, crie a conta, o segundo
fator e a operação pelo próprio fluxo e cadastre clientes e contratos fictícios
pela interface. Qualquer script de semente que venha a existir deve checar o
ambiente antes de rodar e nunca apontar para produção.

---

## 6. Exportação e restauração (ensaio com dados fictícios)

Ensaio, não backup de produção.

```bash
# Exportar (dados + esquema) de um projeto
npx supabase db dump --db-url "$URL_DO_BANCO" -f ensaio.sql --data-only
npx supabase db dump --db-url "$URL_DO_BANCO" -f esquema.sql

# Restaurar num banco vazio
psql "$URL_DESTINO" -f esquema.sql
psql "$URL_DESTINO" -f ensaio.sql
```

Confira depois da restauração: quantidade de contratos e parcelas, soma das
parcelas por contrato igual ao total contratado, e os indicadores batendo com os
lançamentos.

**Backup de produção não está feito.** Existir um comando de exportação não é
backup: faltam automação, retenção, armazenamento externo e um teste de
restauração completo. Isso é pendência da entrega final.

---

## 7. Recuperação de acesso ao segundo fator

Procedimento suportado pelo provedor, sem invenção. **Nada aqui foi testado
contra o serviço real** — depende dos passos da seção 0.

### Caminho 1 — códigos de recuperação (a confirmar)

O SDK expõe `supabase.auth.mfa.recoveryCodes` (`getStatus`, `generate`,
`verify`, `regenerate`, `unenroll`). Na versão instalada neste projeto
(`@supabase/auth-js` 2.116.0) a API está anotada como **`@experimental`**, e
`generate` exige sessão em `aal2`.

Antes de prometer isso ao cliente: confirmar no painel do projeto se a
funcionalidade está disponível e **testar o ciclo inteiro** — gerar, perder o
aparelho, entrar com um código, verificar que o código não serve duas vezes.
Enquanto isso não for feito, não declare recuperação de acesso pronta.

### Caminho 2 — remoção administrativa do fator

É o caminho garantido enquanto o anterior não estiver confirmado. Um
administrador do projeto remove o fator TOTP do usuário (Authentication → Users,
ou a API de administração, que roda **somente no servidor**, com a
`service_role`). O usuário entra de novo e cadastra outro aplicativo
autenticador.

**Remover um segundo fator anula a proteção da conta.** Quem faz isso precisa
ter certeza de que está falando com o dono da conta, e não com alguém que
conseguiu o e-mail dele. Verificação mínima antes de remover:

1. **Canal independente.** Falar por um canal já conhecido e registrado antes
   (o telefone cadastrado do proprietário), nunca apenas respondendo ao e-mail
   ou à mensagem que pediu a remoção — é justamente isso que um invasor usaria.
2. **Confirmar controle do e-mail.** Enviar um código para o e-mail da conta e
   pedir que a pessoa leia de volta, no canal independente.
3. **Conhecimento que só o dono tem.** Duas ou três informações que não estão
   no aparelho perdido nem em documento público: número de um contrato recente
   e o valor da parcela, nome de um cliente cadastrado, data aproximada do
   último recebimento.
4. **Registrar.** Anotar data, hora, quem pediu, quem autorizou, qual canal foi
   usado e quais confirmações foram feitas. Sem registro não há como auditar
   depois.
5. **Avisar.** Notificar o e-mail da conta de que o segundo fator foi removido,
   mesmo que o pedido tenha vindo da própria pessoa — se não foi ela, é assim
   que ela descobre.
6. **Recadastrar na hora.** A conta não deve ficar sem segundo fator: o novo
   aplicativo é cadastrado no mesmo atendimento.

Para uma operação com assistente, quem autoriza a remoção do fator **do
proprietário** é o próprio proprietário ou o administrador do projeto — nunca o
assistente.

Não há, e não deve ser criado, nenhum mecanismo próprio de códigos de
recuperação paralelo ao do provedor.

## 8. Entrega de e-mail

O SMTP padrão do Supabase é limitado e serve apenas para desenvolvimento: poucos
e-mails por hora e entrega não garantida. Confirmação de cadastro e redefinição
de senha dependem disso.

**Pendência:** configurar um SMTP próprio (Authentication → Emails → SMTP
Settings) antes de qualquer uso real, e só então declarar "recuperação de senha
pronta". Nesta etapa o fluxo está implementado e testável, mas a entrega do
e-mail depende dessa configuração externa.

---

## 8.1 Publicar a homologação

A aplicação é um site estático (Vite) que fala com o Supabase pelo navegador —
qualquer hospedagem estática serve, e todas as opções abaixo têm plano gratuito.

```bash
npm run build       # gera dist/
```

**Vercel** (mais direto, já que a conta existe):

1. vercel.com → Add New → Project → importar `gerenciamente-acordos`.
2. Branch: `claude/supabase-integration-2y5yna`. Framework: Vite (detectado).
   Build: `npm run build`. Output: `dist`.
3. Environment Variables — **só valores públicos**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_URL_APLICACAO` = a URL que a Vercel devolver
   Nunca a `service_role`.
4. Deploy. Anote a URL `https://…vercel.app`.

**Depois de publicar, obrigatoriamente**, no painel do Supabase →
Authentication → URL Configuration:

- `Site URL`: a URL publicada.
- `Redirect URLs`: acrescentar `https://SUA-URL/` e `https://SUA-URL/**`.

Sem isso, confirmação de e-mail, redefinição de senha e o link de convite não
voltam para a aplicação. No iPhone o link abre em aba nova, então a URL precisa
estar exatamente certa.

A aplicação usa rotas com `#` (HashRouter), então atualizar uma página interna e
abrir link direto funcionam sem configuração de reescrita no servidor.

A demonstração anterior continua no ar, separada, para comparação. Se quiser
publicar a demonstração também como site, use `npm run build:demo` num projeto
**diferente**, sem nenhuma variável do Supabase.

---

## 9. Pendências antes do uso real

**Financeiras e de regra**

- Atraso em contratos **semanais e mensais**: a dobra da diária não foi
  estendida. Hoje o atraso é apenas identificado, sem acréscimo. Falta decidir
  se há multa, mora ou nada.
- **Feriados municipais** de Feira de Santana: levantados em fonte secundária,
  não no texto legal publicado. Feriados eventuais decretados ano a ano não
  estão cobertos. Carnaval e Quarta-feira de Cinzas são ponto facultativo e
  entram desligados. Cada operação tem sua própria lista, editável em Mais.
- **Composição principal/juros por parcela**: principal e juros são repartidos
  separadamente, cada um com divisão inteira e resto de um centavo nas primeiras
  parcelas. Fecha por construção (soma das parcelas = total, soma dos principais
  = principal, soma dos juros = juros). Método a validar com o cliente.
- Modalidade **"Fixo"**, descontos, renegociação e pagamento parcial continuam
  fora do escopo.
- **Migração de contratos existentes** do sistema atual: não foi feita. Enquanto
  não houver um fluxo explícito, o servidor recusa pagamento anterior à data de
  início do contrato.

**Operacionais**

- **Ligar a homologação de verdade** (seção 0 e 2): criar o projeto, aplicar as
  migrações e validar os fluxos no serviço real. Nada disso foi feito ainda.
- **Disponibilidade de MFA no plano escolhido** (seção 0 e 4.1). Se ficar em
  `aal1` na homologação, voltar a `aal2` antes de qualquer uso real.
- Backup, retenção e ensaio de restauração (seção 6).
- SMTP próprio (seção 8).
- Confirmação do fluxo de recuperação do segundo fator (seção 7).
- Convite de assistente é entregue pelo link gerado na tela; **nada é enviado
  automaticamente por e-mail ou WhatsApp**.
- Não há exclusão de cliente: histórico financeiro não é apagado por
  construção (gatilhos recusam `DELETE`).

---

## 10. Decisões de modelagem que convém revisar

- **Dinheiro** em `BIGINT` de centavos, com `CHECK` limitando a
  999.999.999.999 (R$ 9.999.999.999,99) — bem abaixo de 2^53, para que a
  serialização JSON em JavaScript não perca precisão.
- **Taxa** em `NUMERIC(9,4)`: decimal exato.
- **Datas civis** (`DATE`) para vencimento e pagamento; `TIMESTAMPTZ` para
  criação e auditoria, sempre do relógio do servidor.
- **Chaves estrangeiras compostas com `operacao_id`**: o banco impede, por
  estrutura, que um contrato aponte para cliente de outra operação ou que um
  pagamento seja alocado a parcela de outra operação.
- **Índice único parcial** em `alocacoes_pagamento (parcela_id) where not
  revogada`: é isso que garante "uma parcela, um pagamento ativo" contra duplo
  toque, reenvio e duas sessões simultâneas. Botão desabilitado não garante nada.
- **Snapshot no contrato** (feriados, fuso, regra de atraso): mudar a
  configuração da operação vale para contratos novos e não recalcula os
  existentes.
