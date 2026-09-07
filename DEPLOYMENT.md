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

## Banco de dados (Supabase)

- Projeto: `itzlqcwqcuogadfdmobw`
- As 21 migrations de `supabase/migrations/` foram aplicadas manualmente via
  **SQL Editor** do Supabase (em 4 partes, na ordem dos arquivos), porque o
  ambiente onde o Claude roda não tem saída de rede liberada para
  `*.supabase.co`. Qualquer migration nova precisa do mesmo processo manual
  até isso mudar (ou até configurarmos a Supabase CLI/GitHub Action rodando
  de um ambiente com rede liberada).
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
  - Ainda faltam (Fase 5/6/9, quando as credenciais reais existirem):
    `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`,
    `MERCADOPAGO_WEBHOOK_SECRET`, `CAF_API_KEY`
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

## Apps mobile (Cliente / Entregador) — pendente

Ainda sem build/publicação nem teste em dispositivo real. Tentativa de
testar via **Expo Go + túnel** (rodando `npx expo start --tunnel` num
GitHub Codespace, já que o sandbox onde o Claude roda não tem saída de rede
pro Expo/ngrok): o QR code chegou a aparecer, mas o túnel do ngrok (usado
por padrão pelo `--tunnel`) se mostrou instável — em uma tentativa o app no
iPhone deu "There was a problem running the requested project" sem nenhum
log chegar no Metro (a conexão nunca se estabeleceu de fato), e em outra
tentativa o próprio `expo start --tunnel` falhou ao subir o túnel
(`CommandError: Cannot read properties of undefined (reading 'body')` —
erro conhecido do ngrok anônimo/gratuito, não do nosso código). Pausado por
decisão consciente — retomar quando houver tempo/paciência para depurar a
conexão, ou pular direto para a Opção B abaixo.

Plano quando retomar:
1. **Opção A** — Expo Go + túnel: tentar de novo (`npx expo start --tunnel`
   em um Codespace), ou trocar de provedor de túnel (o `@expo/ngrok`
   embutido é antigo/instável; vale tentar `--tunnel` com uma conta ngrok
   autenticada, ou uma alternativa como Cloudflare Tunnel).
2. **Opção B** — gerar um `.apk` de teste via EAS Build (mais robusto, não
   depende de manter um túnel conectado, mas precisa de conta gratuita em
   expo.dev e ~15 min de build na nuvem deles).

Builds assinados de verdade (pra loja) precisam de conta EAS + Apple
Developer Program (US$99/ano) + Google Play Console (US$25 único). Bundle
IDs já definidos: `br.com.guelaseco.cliente` e `br.com.guelaseco.entregador`
(`apps/*/app.json`).

## Provedor de KYC (verificação do entregador)

Decidido: **CAF (Combate à Fraude)** — substitui o BitcoinP2P (nunca teve
documentação confiável, ficou só como scaffolding não-funcional). Mesma
honestidade de antes: sem documentação técnica real da API do CAF, o
provider (`caf-kyc-provider.ts`) fica pronto estruturalmente mas lança erro
claro em vez de inventar uma integração. Falta: doc técnica da API + API key
de teste do CAF para terminar de verdade.

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
- Credenciais Mercado Pago (sandbox → produção)
- Decisão + credenciais do provedor de KYC (BitcoinP2P sem documentação
  confiável até agora)
- Decisão do provedor de saque PIX (hoje é aprovação manual pelo admin)
- Conta Apple Developer / Google Play Console
- Política de privacidade + termos de uso (LGPD)
