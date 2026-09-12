# Continuidade numa sessão local do Claude Code

Este arquivo é o roteiro de trabalho para retomar a integração **na sua
máquina**, onde o acesso ao Supabase existe. Ele é escrito para ser lido pelo
Claude Code local: abra o projeto, mande ler este documento, e ele executa.

---

## Por que mudar de ambiente

A sessão remota onde o projeto foi construído não alcança o Supabase: o gateway
de rede responde 403 ao CONNECT para `supabase.com`, `api.supabase.com` e
`*.supabase.co`. Isso é política do ambiente e **não deve ser contornada**. Da
sua máquina o acesso é normal, então o trabalho continua lá.

---

## Ponto de partida

```bash
git clone https://github.com/MarcBuzatto/gerenciamente-acordos.git
cd gerenciamente-acordos
git checkout claude/supabase-integration-2y5yna
npm install
claude                      # abre o Claude Code nesta pasta
```

Primeira instrução a dar para a sessão local:

> Leia `docs/SESSAO-LOCAL.md` e `docs/INTEGRACAO.md` e execute o roteiro da
> seção "Sequência de execução". Confirme comigo antes de cada passo marcado
> como decisão minha.

### O que já está pronto e testado

| | Estado |
| --- | --- |
| Migrações (4 arquivos) | aplicadas e testadas em PostgreSQL 16 local e no CI |
| Testes | 79 passando: domínio, classificação de erros, integração com o banco |
| Conformidade de esquema | 13 conferências, `supabase/tests/02_conformidade.sql` |
| Frontend integrado | compila e roda; login, MFA, convites e telas implementados |
| Modo demonstração | preservado e funcionando (`npm run dev:demo`) |
| Supabase real | **nada aplicado, nada validado** |
| Publicação | **não existe** |

### Regras que não mudam

- **`aal2` é obrigatório**, na homologação e na produção. O plano Free do
  Supabase inclui "Basic Multi-Factor Auth" (TOTP por aplicativo autenticador),
  que é exatamente o que este projeto usa; o que é pago é "Advanced MFA —
  Phone", que não usamos. Não existe, e não deve ser criado, mecanismo de
  rebaixar a exigência — a conferência 12 do script de conformidade falha se
  alguém tentar.
- PRs #1 e #2 seguem **draft, sem merge**.
- **Nenhum dado real do cliente** entra em homologação.
- Nada de `service_role` em variável `VITE_*` — tudo com esse prefixo vai para
  o bundle do navegador.
- Sem assinatura de eventos de PR, sem acompanhamento automático, sem check-ins
  agendados.

---

## Divisão de trabalho

### O que depende de você (e só isso)

1. Criar o projeto no painel do Supabase (plano **Free**).
2. Rodar `npx supabase login` — abre o navegador e autentica pelo fluxo oficial.
   **Nenhuma senha ou token é digitado na conversa.**
3. Guardar a senha do banco no seu gerenciador de senhas e exportá-la no shell
   quando o roteiro pedir, com `read -rsp` (não fica no histórico).
4. Cadastrar o segundo fator no seu aplicativo autenticador quando a tela pedir.
5. Abrir os e-mails de confirmação e de recuperação de senha que chegarem.
6. Decidir o que for decisão: nome do projeto, região, aprovar cada push depois
   de ver o que ele muda.

### O que o Claude local executa

Tudo o mais: inspeção do destino, revisão do que será alterado, aplicação das
migrações, conferência de conformidade, configuração das URLs, execução dos
fluxos funcionais, testes de acesso indevido pela API, build, publicação e
relatório.

---

## Sequência de execução

### Passo 1 — criar o projeto (você)

Painel do Supabase → New project.

- Organização: a sua.
- Nome: `acordos-homologacao`.
- Plano: **Free**.
- Região: `South America (São Paulo)`.
- Senha do banco: gerar e guardar no gerenciador de senhas.

Anote o **project ref** (aparece na URL do painel e em Project Settings).

### Passo 2 — autenticar a CLI (você)

```bash
npx supabase login          # abre o navegador; fluxo oficial
npx supabase projects list  # confirme que o ref esperado aparece
```

### Passo 3 — vincular e conferir o destino (Claude)

```bash
npx supabase link --project-ref SEU_REF

read -rsp 'URL do banco (Project Settings → Database → Connection string): ' SUPABASE_DB_URL
export SUPABASE_DB_URL && echo

./scripts/conferir-destino.sh
```

O script inspeciona o banco **inteiro**, não só `auth.users`: schemas
não-sistema e seus objetos, todas as tabelas de `public` com contagem real de
linhas, `auth.users`, `auth.mfa_factors`, `auth.sessions`, `storage.buckets`,
`storage.objects`, e o histórico de migrações. Termina com um veredito:

- **LIMPO** — pode seguir.
- **JÁ TEM ESTE PROJETO** — é re-push; revisar o `--dry-run` com atenção.
- **ATENÇÃO** — há dados e o schema `app` não existe: **provavelmente o destino
  está errado**. Parar e confirmar com você antes de qualquer coisa.

> **Trava:** não aplicar nada enquanto o veredito não for LIMPO ou o re-push não
> for confirmado por você.

### Passo 4 — revisar e aplicar as migrações (Claude, com sua aprovação)

```bash
npx supabase db push --dry-run     # mostra o que SERIA aplicado
```

Ler a saída, conferir que são exatamente os quatro arquivos de
`supabase/migrations/` e nada mais, e **mostrar a você antes de aplicar**.

```bash
npx supabase db push
```

Logo depois:

```bash
./scripts/verificar-homologacao.sh
npx supabase db advisors --type security
```

O primeiro roda as 13 conferências de conformidade contra o projeto real
(RLS em todas as tabelas, `anon` sem privilégio, sem escrita direta em tabela
financeira, `search_path` fixo em toda função `SECURITY DEFINER`, funções
internas fora do alcance, nenhuma função manipulando claims de JWT, chaves
compostas, índice único parcial, gatilhos de bloqueio de exclusão, `aal2` sem
porta dos fundos). O segundo é o linter de segurança do próprio Supabase —
qualquer achado dele vira item de trabalho, não observação.

### Passo 5 — revisar e aplicar a configuração de auth (Claude, com sua aprovação)

**`supabase config push` sobrescreve a configuração remota com o
`supabase/config.toml` local.** Nunca rodar às cegas.

```bash
npx supabase config diff      # o que mudaria no projeto remoto
```

Ler item a item. Prestar atenção especial em:

- `site_url` e `additional_redirect_urls` — precisam apontar para o ambiente
  certo. Ajustar o `config.toml` antes do push, não depois.
- `[auth.email] enable_confirmations` — tem de continuar ligado.
- `[auth.mfa.totp]` — `enroll_enabled` e `verify_enabled` ligados.
- Qualquer seção que o `config.toml` local não declara e que o diff mostre como
  alteração: investigar antes, porque pode estar desfazendo algo do painel.

Só depois:

```bash
npx supabase config push
npx supabase config diff       # deve sair vazio
```

### Passo 6 — subir a aplicação local contra o projeto real (Claude)

```bash
cp .env.example .env.local
# preencher VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (Project Settings →
# Data API e API Keys) e VITE_URL_APLICACAO=http://localhost:5173
npm run dev
```

### Passo 7 — validação no serviço real (Claude executa; você faz só o humano)

Registrar o resultado de cada item, com print quando fizer sentido.

**Autenticação**

1. Cadastro do proprietário → **você** abre o e-mail de confirmação.
2. Login.
3. Cadastro do TOTP: ler o QR Code, **você** informa o código do aplicativo.
   Confirmar que é o TOTP do plano Free funcionando.
4. Confirmar que, entre o login e a conclusão do segundo fator, **nenhum dado
   de operação carrega** — e que a recusa vem do banco, não da tela (testar
   direto na API, ver abaixo).
5. Logout e novo login: deve pedir o código de novo.
6. Recuperação de senha → **você** abre o e-mail e define a nova senha.
   Se o e-mail não chegar, é o SMTP de desenvolvimento do Supabase: registrar
   como bloqueio, não como falha do código.

**Equipe**

7. Criar a operação (nasce vazia).
8. Gerar convite de assistente em Mais → Equipe.
9. Aceitar o convite numa segunda conta, com o e-mail correto.
10. Tentar aceitar o mesmo convite com uma terceira conta: deve recusar.
11. Revogar o assistente com a sessão dele aberta e confirmar que a próxima
    ação dele já falha.

**Fluxos financeiros**

12. Cadastrar cliente.
13. Criar contrato R$ 1.000 a 40% em 20 parcelas diárias e conferir: juros
    R$ 400, total R$ 1.400, 20 parcelas de R$ 70, calendário pulando domingo e
    feriado.
14. Registrar pagamento.
15. Registrar pagamento retroativo e conferir que entra na data real, sem
    acréscimo por atraso de digitação.
16. Conferir o acréscimo único da diária atrasada (R$ 70 → R$ 140, e continua
    R$ 140).
17. Quitar um contrato.
18. Reverter um pagamento com motivo e conferir o histórico.
19. Conferir indicadores e extrato, e que reconciliam com as parcelas.

**Isolamento e acesso indevido — direto na API, não pela tela**

20. Criar uma segunda operação com outra conta e confirmar que nenhuma das duas
    enxerga a outra.
21. Com o token do assistente, chamar `indicadores` e ler `contratos`,
    `parcelas`, `pagamentos` e `auditoria` pela REST API: tudo deve ser recusado
    ou voltar vazio.
22. Trocar IDs no payload (operação de outro, parcela de outro) e confirmar a
    recusa.
23. Tentar promover o próprio papel via `membros_operacao`: deve falhar.
24. Chamar qualquer endpoint com a chave anônima e sem sessão: nada deve voltar.
25. Tentar pagar duas vezes a mesma parcela e reenviar a mesma requisição:
    um único lançamento.

Usar `curl` contra `https://SEU_REF.supabase.co/rest/v1/…` com a chave anônima e
o `access_token` do usuário. **Nunca a `service_role`.**

### Passo 8 — publicar (Claude, com sua autorização)

```bash
npm run build
```

Publicar em hospedagem estática gratuita — Vercel, Netlify ou Cloudflare Pages.
Variáveis de ambiente: apenas `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e
`VITE_URL_APLICACAO` (a URL publicada).

Depois de publicar, **obrigatoriamente**, no painel do Supabase →
Authentication → URL Configuration:

- `Site URL`: a URL publicada.
- `Redirect URLs`: `https://SUA-URL/` e `https://SUA-URL/**`.

E então, no iPhone:

- Abrir a URL, entrar, informar o código do autenticador.
- Atualizar uma página interna (F5 / puxar para recarregar) e confirmar que não
  quebra — a aplicação usa rotas com `#`, então isso deve funcionar sem
  reescrita no servidor.
- Abrir um link de convite e um de recuperação de senha **pelo celular**, que é
  onde o Safari abre em aba nova.
- Conferir navegação inferior, áreas de toque e área segura inferior.

A demonstração anterior continua separada, para comparação. Se for publicar a
demonstração como site, usar `npm run build:demo` num projeto **diferente**, sem
nenhuma variável do Supabase.

### Passo 9 — relatar

Fechar com: link da homologação, o que foi verificado **no Supabase real** item
a item, o que ficou pendente e por quê, e o estado dos PRs (draft, sem merge).

---

## Bloqueios conhecidos que podem aparecer

| Sintoma | O que é | O que fazer |
| --- | --- | --- |
| E-mail de confirmação ou de recuperação não chega | SMTP padrão do Supabase é de desenvolvimento: poucos e-mails por hora, entrega não garantida | Registrar como bloqueio de configuração. Para uso real, configurar SMTP próprio em Authentication → Emails. Não inventar remetente nem contratar serviço pago |
| `config push` quer alterar algo não declarado | O `config.toml` local não cobre tudo o que existe no painel | Investigar o item antes; declarar no `config.toml` ou ajustar no painel. Não empurrar por cima |
| Veredito ATENÇÃO na pré-checagem | Destino provavelmente errado | Parar. Confirmar o ref com você |
| `db advisors` aponta algo | Linter de segurança do Supabase | Tratar como item de trabalho e corrigir na branch |

---

## Pendências que seguem abertas

Não mudam com a ligação da homologação — estão detalhadas em
`docs/INTEGRACAO.md`:

- Atraso em contratos semanais e mensais (regra não definida).
- Feriados municipais de Feira de Santana levantados em fonte secundária.
- Composição principal/juros por parcela, a validar com o cliente.
- Migração dos contratos existentes do sistema atual.
- Backup: automação, retenção, armazenamento externo e ensaio de restauração.
- SMTP próprio.
- Ciclo completo de recuperação do segundo fator (a API de códigos de
  recuperação está marcada como experimental no SDK).
