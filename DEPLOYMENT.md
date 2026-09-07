# Deploy — GUELA SECO

Registro do que está hospedado, onde, e o que falta. **Nenhuma chave/senha real
fica neste arquivo** — só nomes de variáveis e onde encontrar o valor.

## Infraestrutura atual

| Peça | Provedor | Status | URL |
|---|---|---|---|
| Banco de dados | Supabase | ✅ No ar | `https://itzlqcwqcuogadfdmobw.supabase.co` |
| Backend (API) | Railway | ✅ No ar | `https://guela-secobackend-production.up.railway.app` |
| Painel Admin | Vercel | ⏳ Em andamento | — |
| Painel Parceiro | Vercel | ⏳ Em andamento | — |
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
  - Ainda faltam (Fase 5/6/9, quando as credenciais reais existirem):
    `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`,
    `MERCADOPAGO_WEBHOOK_SECRET`, `BITCOINP2P_API_KEY`
- Health check: `GET /health` → `{"status":"ok","service":"guela-seco-backend",...}`

## Painéis web (Vercel) — em andamento

Cada app (`apps/admin`, `apps/parceiro`) vira um projeto Vercel separado,
com **Root Directory** apontando pra sua pasta. Variáveis de ambiente
(iguais nos dois, valores públicos — seguros pra expor no client):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_BACKEND_URL` = `https://guela-secobackend-production.up.railway.app`

## Apps mobile (Cliente / Entregador) — pendente

Ainda sem build/publicação. Plano:
1. Testar via **Expo Go** (app grátis na loja) apontando pro backend do
   Railway — não precisa de conta Apple/Google pra isso.
2. Builds assinados de verdade (pra loja) precisam de conta EAS + Apple
   Developer Program (US$99/ano) + Google Play Console (US$25 único).
   Bundle IDs já definidos: `br.com.guelaseco.cliente` e
   `br.com.guelaseco.entregador` (`apps/*/app.json`).

## Pendências externas (não dependem de código)

Ver relatório completo da Fase 11 na conversa. Resumo:
- Credenciais Mercado Pago (sandbox → produção)
- Decisão + credenciais do provedor de KYC (BitcoinP2P sem documentação
  confiável até agora)
- Decisão do provedor de saque PIX (hoje é aprovação manual pelo admin)
- Conta Apple Developer / Google Play Console
- Política de privacidade + termos de uso (LGPD)
