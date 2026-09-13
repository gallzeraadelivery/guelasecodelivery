# Deploy — GUELA SECO

Registro do que está hospedado, onde, e o que falta. **Nenhuma chave/senha real
fica neste arquivo** — só nomes de variáveis e onde encontrar o valor.

## Infraestrutura atual

| Peça | Provedor | Status | URL |
|---|---|---|---|
| Banco de dados | Supabase | ✅ No ar | `https://itzlqcwqcuogadfdmobw.supabase.co` |
| Backend (API) | Railway | ✅ No ar | `https://guela-secobackend-production.up.railway.app` |
| Painel Admin | Vercel | ✅ No ar | `https://guelasecodelivery-admin.vercel.app` |
| Painel Parceiro | Vercel | ✅ No ar | `https://guelasecodelivery-parceiro-gzd6.vercel.app` |
| App Cliente (mobile) | — | ⏳ Não publicado | — |
| App Entregador (mobile) | — | ⏳ Não publicado | — |

Este projeto Supabase é usado tanto para desenvolvimento/teste quanto para
produção por enquanto (decisão consciente — ver histórico da conversa). Antes
do lançamento real, avaliar se vale separar em dois projetos.

## Acesso via CLI (ambiente local do Claude)

Desde 12/09/2026, as CLIs oficiais de cada provedor estão instaladas e
autenticadas no ambiente local onde o Claude roda, permitindo atualizar cada
ambiente diretamente (sem depender só de push/CI):

- **Supabase CLI** (`supabase`) — logado via personal access token, projeto
  linkado (`supabase link --project-ref itzlqcwqcuogadfdmobw`). Usado para
  aplicar migrations (`supabase db push`) e consultar status
  (`supabase migration list`).
- **Railway CLI** (`railway`) — logado, projeto linkado (`extraordinary-unity`
  → serviço `@guela-seco/backend`). Usado para ver logs/status/redeploy sem
  precisar entrar no dashboard.
- **Vercel CLI** (`vercel`) — logado, projetos `apps/admin` e `apps/parceiro`
  linkados aos projetos corretos (`guelasecodelivery-admin` e
  `guelasecodelivery-parceiro-gzd6`).
- **EAS CLI** (`eas`) — logado (conta Expo). `apps/cliente` já linkado ao
  projeto `quela-seco-cliente`; `apps/entregador` ainda sem projeto EAS (ver
  seção "Apps mobile" abaixo).

Credenciais (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) ficam num `.env`
na raiz do repo, **gitignored**, nunca commitado. As sessões de login do
Railway/Vercel/EAS ficam salvas nas configs globais dessas CLIs (fora do
repo). Railway e Vercel já fazem **deploy automático a cada `git push`** na
branch atual (conectados direto ao GitHub) — a CLI deles aqui é só para
inspeção/ações manuais, não é necessária para o deploy em si acontecer.

## Banco de dados (Supabase)

- Projeto: `itzlqcwqcuogadfdmobw`
- As 23 migrations de `supabase/migrations/` existentes até 12/09/2026 foram
  aplicadas manualmente via **SQL Editor** do Supabase, porque, até então, o
  ambiente onde o Claude rodava não tinha saída de rede liberada para
  `*.supabase.co`. Isso mudou: a partir de 12/09/2026 esse ambiente já
  alcança a API do Supabase, e o histórico de migrations foi sincronizado
  via `supabase migration repair` (marca como aplicadas as 23 já existentes,
  sem re-executar SQL). A partir de agora, **migrations novas devem ser
  aplicadas via CLI** (ver seção "Acesso via CLI" abaixo), não mais colando
  no SQL Editor:
  ```bash
  supabase db push -p "$SUPABASE_DB_PASSWORD" --linked
  ```
- Dados de demonstração (categorias, 1 distribuidora "Distribuidora Demo",
  4 produtos) foram inseridos via SQL Editor — ver seed original em
  `supabase/seed.sql` (mesmo conteúdo, adaptado pra rodar direto no projeto
  real em vez de só localmente).
- Primeiro usuário admin: criado manualmente em **Authentication → Users**
  no Supabase, depois promovido com
  `update public.profiles set role = 'admin' where id = '<uuid>';`
  (não há tela de autocadastro de admin — decisão de segurança).

## Backend (Railway)

- Serviço: `backend` (projeto Railway `guela-seco`).
- Build/start configurados via `railway.json` na raiz do repo — builda e
  roda só `@guela-seco/backend`, a partir da raiz do monorepo (necessário
  porque o backend depende de `@guela-seco/config` via pnpm workspace).
- ⚠️ Uma armadilha: ao conectar o repositório pela primeira vez, o Railway
  detectou automaticamente 5 sub-projetos do monorepo (backend, admin,
  parceiro, cliente, entregador) e criou um serviço pra cada um, ignorando o
  `railway.json`. Os serviços de `cliente`/`entregador` (apps mobile Expo)
  nunca devem existir no Railway — não são servidores. `admin`/`parceiro`
  também foram removidos daqui porque vão para a Vercel. Só o serviço
  `backend` deve existir neste projeto Railway.
- Variáveis de ambiente configuradas no Railway (Settings → Variables):
  - `NODE_ENV=production`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `BACKEND_PUBLIC_URL` (a própria URL pública do serviço, gerada em
    Settings → Networking → Generate Domain)
  - `ALLOWED_ORIGINS=https://guelasecodelivery-admin.vercel.app,https://guelasecodelivery-parceiro-gzd6.vercel.app`
    (CORS — sem isso, os painéis web recebem "Failed to fetch" ao chamar a
    API, mesmo autenticados corretamente; apps mobile não precisam disso)
  - `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_LEVEL_NAME` — ✅
    configuradas e testadas de ponta a ponta (ver seção de KYC abaixo)
  - `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`,
    `MERCADOPAGO_WEBHOOK_SECRET` — ✅ configuradas (ver seção de Pagamentos
    abaixo)
- Health check: `GET /health` → `{"status":"ok","service":"guela-seco-backend",...}`

## Painéis web (Vercel)

Cada app (`apps/admin`, `apps/parceiro`) é um projeto Vercel separado, com
**Root Directory** apontando pra sua pasta e **Framework Preset = Next.js**
(precisa ser setado manualmente — o Vercel às vezes detecta como "Other" em
projetos de monorepo, o que causa 404 em todas as rotas). Variáveis de
ambiente (iguais nos dois, valores públicos — seguros pra expor no client):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_BACKEND_URL` = `https://guela-secobackend-production.up.railway.app`

⚠️ Ao importar o projeto, o Vercel escaneia o monorepo inteiro e sugere
variáveis "detectadas" de outros apps (inclusive potencialmente segredos do
backend). Sempre apagar as detectadas e adicionar manualmente só as 3 acima.

Login do admin: só via conta criada manualmente no Supabase (Authentication
→ Users) + promovida a `role = 'admin'` — sem autocadastro.

✅ Testado de ponta a ponta: login no admin + página Financeiro carregando
dados reais do backend/Supabase (zerados, como esperado sem pedidos ainda).

✅ Painel parceiro também testado: conta de teste vinculada como `owner` da
"Distribuidora Demo" (ver seed abaixo), catálogo/preço/estoque carregando e
editável.

## Apps mobile (Cliente / Entregador)

**App cliente**: build de teste (`.apk`, perfil `preview`) gerado com sucesso
via **EAS Build acionado pelo GitHub** (dashboard expo.dev, projeto
`quela-seco-cliente` — sem CLI local, sem Android Studio). Instalado e
testado num Android real. Duas correções de dependências que travavam o
build nativo, já commitadas:
- `apps/cliente/app.json`: slug corrigido pra bater com o nome do projeto
  registrado no Expo (`quela-seco-cliente`, não `guela-seco-cliente`) +
  `owner`/`extra.eas.projectId`.
- `react-native-reanimated` e `react-native-worklets` fixados em `4.5.5` /
  `0.10.4` (respectivamente) nos dois apps — sem isso o pnpm resolvia
  `react-native-worklets@0.12.1` (puxado como peer opcional pelo
  `expo-router`), que já removeu a API síncrona que o `expo-modules-core`
  57.0.14 deste SDK ainda chama (`WorkletRuntime::executeSync`), quebrando a
  compilação C++/CMake do Android.

Variáveis de ambiente (`EXPO_PUBLIC_BACKEND_URL`,
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
configuradas no ambiente **Preview** do projeto EAS.

**App entregador**: ainda não tem projeto EAS configurado — repetir o mesmo
processo (novo projeto no expo.dev, conectar GitHub apontando pra
`apps/entregador`, `app.json` com slug/owner/projectId corretos, variáveis
de ambiente) quando formos testá-lo.

Builds assinados de verdade (pra loja) precisam de conta EAS + Apple
Developer Program (US$99/ano) + Google Play Console (US$25 único). Bundle
IDs já definidos: `br.com.guelaseco.cliente` e `br.com.guelaseco.entregador`
(`apps/*/app.json`).

### Bugs encontrados no teste do APK (cliente) — 12/09/2026

- **Cadastro fingia sessão logada sem confirmação de e-mail** — corrigido
  (`signup.tsx` agora checa `data.session` e não navega pro catálogo se vier
  vazio). Isso também causava "endereço não salva" (silencioso) e "checkout
  diz que não está logado", que eram sintomas da mesma causa.
- **Catálogo sem feedback ao adicionar item** — corrigido (toast "✓ produto
  adicionado ao carrinho").
- **E-mail de confirmação do Supabase não está sendo entregue** — usuário
  se cadastrou, apareceu o aviso "confirme seu e-mail" (comportamento
  esperado após o fix acima), mas o e-mail nunca chegou. **Ainda não
  investigado a fundo** — suspeitas mais prováveis, a checar no painel do
  Supabase (Authentication → Logs / Emails):
  - Rate limit do provedor de e-mail padrão do Supabase (muito baixo, tipo
    poucos e-mails/hora — comum em projetos novos sem SMTP customizado).
  - E-mail caindo em spam/lixo eletrônico.
  - SMTP customizado não configurado (Supabase recomenda configurar um
    provedor próprio — Resend, SendGrid etc. — pra produção real).
  Solução rápida pra destravar teste agora: desativar "Confirm email" em
  Authentication → Providers → Email (reversível, só pra ambiente de
  teste), ou confirmar o usuário manualmente em Authentication → Users.
  **Pendente decidir e resolver antes de ir para produção com clientes
  reais** — sem e-mail de confirmação funcionando, ninguém consegue criar
  conta.

## Provedor de KYC (verificação do entregador)

Decidido: **Sumsub** — substitui CAF (rebrand "Certta"), que exigia contato
comercial em vez de autocadastro self-service, e antes disso BitcoinP2P
(nunca teve documentação confiável). Integração real implementada em
`sumsub-kyc-provider.ts`, a partir de documentação oficial confirmada
página a página:

- **Authentication**: assinatura HMAC-SHA256 (`X-App-Access-Sig`) sobre
  `timestamp + METHOD + URI(com query) + rawBody`, usando a Secret Key;
  headers `X-App-Token` e `X-App-Access-Ts` (Unix seconds).
- **Create applicant** (`POST /resources/applicants?levelName=...`) — cria o
  applicant com `externalUserId` = id do entregador.
- **Add verification documents** (`POST /resources/applicants/{id}/info/idDoc`,
  multipart) — envia CNH (frente/verso) e selfie.
- **Request applicant check** (`POST /resources/applicants/{id}/status/pending`)
  — coloca o applicant na fila de revisão.
- **Get applicant review status** (`GET /resources/applicants/{id}/status`)
  — consulta `reviewStatus`/`reviewResult.reviewAnswer` (`GREEN`/`RED`) para
  saber se foi aprovado, rejeitado ou ainda está em análise.

✅ **Testado de ponta a ponta em produção** (Railway + Sumsub sandbox real):
`POST /drivers/kyc` com CPF/CNH/CNH frente+verso/selfie retornou
`202 {"status":"PENDING"}`, com o applicant aparecendo no Sumsub Cockpit e o
registro correspondente gravado em `kyc_checks` no Supabase.

Duas pegadinhas reais encontradas e corrigidas ao testar contra a API real
(nenhuma delas era óbvia pela documentação em si):

- O erro `400 "Cannot read a metadata object from the body"` do endpoint de
  upload de documento é enganoso — não é problema de formatação do
  multipart, é qualquer valor inválido dentro do JSON de `metadata`. No
  nosso caso: `idDocSubType` deve ser `"FRONT_SIDE"`/`"BACK_SIDE"`, não
  `"FRONT"`/`"BACK"`.
- A CNH (`DRIVERS`) é documento de duas faces — se só a frente for enviada,
  o Sumsub recusa `status/pending` com `"Not all required documents...
  [IDENTITY]"`. É preciso enviar frente E verso antes de solicitar a
  checagem (o app do entregador já captura os dois lados, então isso é
  transparente pro fluxo real — só afetou os testes manuais via curl).

Variáveis `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` e `SUMSUB_LEVEL_NAME` já
configuradas no Railway com credenciais de sandbox reais.

## Pagamentos (Mercado Pago)

✅ **OAuth Marketplace conectado e testado em produção**: a "Distribuidora
Demo" foi vinculada com sucesso a uma conta real do Mercado Pago via
`GET /partners/:id/mercadopago/connect` → autorização no Mercado Pago →
`GET /partners/mercadopago/callback`. Painel parceiro mostra "Mercado Pago
conectado".

Onde encontrar as credenciais no painel do Mercado Pago (armadilha real):
`Client ID` e `Client Secret` **só aparecem na aba "Credenciais de
produção"** dentro de "Detalhes da aplicação" — não aparecem na aba
"Credenciais de teste" (lá só tem Public Key/Access Token e dados de
usuário de teste). Mesmo assim, servem pra testar o fluxo OAuth com contas
reais — não é preciso ativar pagamentos de produção só pra ver esses dois
campos.

Também é necessário cadastrar a **URL de redirecionamento** exata na
aplicação (em "Configuração avançada"):
`{BACKEND_PUBLIC_URL}/partners/mercadopago/callback` — sem isso, o
Mercado Pago recusa a autorização com um erro genérico
("Desculpe, não foi possível conectar o aplicativo à sua conta").

Variáveis `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET` e
`MERCADOPAGO_WEBHOOK_SECRET` configuradas no Railway. `BACKEND_PUBLIC_URL`
também precisa estar setada (usada tanto pro redirect_uri do OAuth quanto
pro CORS/health check) — faltou inicialmente e causava
`503 "Mercado Pago não configurado"` mesmo com as 3 variáveis do Mercado
Pago certas.

Ainda falta testar: criar um pedido de verdade e abrir o checkout
(`createCheckout`), e confirmar que o webhook de pagamento
(`POST /webhooks/mercadopago`) processa a notificação corretamente — só
dá pra fazer isso via app mobile ou curl direto, já que o teste do app
mobile está pausado (ver seção abaixo).

## Política de Privacidade e Termos de Uso

Minuta publicada como artifact (não versionada no repositório, é conteúdo
jurídico e não código): https://claude.ai/code/artifact/6565045a-81ac-423d-9f81-861d8f51da60

Cobre exatamente os dados hoje coletados pelo app (CPF/CNH/selfie do
entregador, localização, endereços, pagamento via Mercado Pago, CNPJ da
distribuidora). Tem campos `[A PREENCHER]` (razão social, CNPJ, endereço,
e-mail de contato, foro) e precisa de revisão jurídica antes de valer como
documento oficial — necessário para a política de privacidade exigida pelas
lojas de app e pela LGPD.

## Pendências externas (não dependem de código)

Ver relatório completo da Fase 11 na conversa. Resumo:
- Decisão do provedor de saque PIX (hoje é aprovação manual pelo admin)
- Conta Apple Developer / Google Play Console
- Política de privacidade + termos de uso (LGPD)
- E-mail de confirmação de cadastro não está sendo entregue pelo Supabase
  (ver seção "Apps mobile" acima) — bloqueia novos cadastros até resolver
- Revisão completa ("pente fino") do app cliente após os testes manuais em
  dispositivo real, e depois repetir para o app entregador
