# Integração com Supabase — homologação

Documento operacional desta etapa: o que é preciso para rodar, como aplicar as
migrações, como testar as permissões e o que ainda falta antes de qualquer uso
com dinheiro real.

Esta etapa **não** foi liberada para produção e **não** migra dados reais.

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

### No projeto de homologação

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

Procedimento suportado pelo provedor, sem invenção:

1. **Códigos de recuperação** — o SDK expõe `auth.mfa.recoveryCodes` (gerar,
   verificar, regenerar). A API está marcada como **experimental** no SDK e
   depende de estar habilitada no projeto. Antes de prometer isso ao cliente,
   confirmar no painel do projeto de homologação se a funcionalidade está
   disponível e testar o ciclo inteiro.
2. **Remoção do fator por um administrador** — enquanto o item acima não estiver
   confirmado, o caminho garantido é um administrador do projeto remover o fator
   TOTP do usuário (Authentication → Users) usando a API de administração, que
   roda **somente no servidor**, com a `service_role`. O usuário entra de novo e
   cadastra um novo aplicativo autenticador.

Não há, e não deve ser criado, nenhum mecanismo próprio de códigos de
recuperação paralelo ao do provedor.

---

## 8. Entrega de e-mail

O SMTP padrão do Supabase é limitado e serve apenas para desenvolvimento: poucos
e-mails por hora e entrega não garantida. Confirmação de cadastro e redefinição
de senha dependem disso.

**Pendência:** configurar um SMTP próprio (Authentication → Emails → SMTP
Settings) antes de qualquer uso real, e só então declarar "recuperação de senha
pronta". Nesta etapa o fluxo está implementado e testável, mas a entrega do
e-mail depende dessa configuração externa.

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
