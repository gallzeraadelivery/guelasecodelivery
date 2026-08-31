# GUELA SECO

Marketplace de delivery de bebidas — o cliente monta o carrinho no catálogo do GUELA SECO e a
plataforma decide automaticamente qual distribuidora atende o pedido. Lançamento inicial em
Cuiabá/MT.

## Estrutura do monorepo

```
apps/
  cliente/      Expo (React Native) — app do cliente final
  entregador/   Expo (React Native) — app do entregador
  parceiro/     Next.js — painel web responsivo para distribuidoras
  admin/        Next.js — painel administrativo GUELA SECO
  backend/      Node.js (Fastify) — API e regras críticas (financeiro, estoque, dispatch)
packages/
  config/       tsconfig/eslint/prettier compartilhados
supabase/
  migrations/   migrations SQL versionadas do Postgres/Supabase
```

Outros pacotes (`types`, `validation`, `financial`, `logistics`, `catalog`, `providers`, `ui`,
`utils`) serão criados nas fases seguintes, à medida que forem efetivamente usados — para não
carregar o repo com esqueletos vazios.

## Requisitos

- Node.js 20+
- pnpm 10+ (`corepack enable` habilita a versão fixada em `packageManager`)
- Supabase CLI (para rodar migrations localmente)
- Conta Supabase, Mercado Pago (marketplace/split), Mapbox, BitcoinP2P (KYC), Expo/EAS

## Scripts

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Cada comando roda via Turborepo em todos os apps/packages do workspace.

## Ambientes

Três ambientes são previstos: `development`, `staging`, `production`, cada um com seu próprio
projeto Supabase e credenciais de Mercado Pago (sandbox em dev/staging). Nenhum segredo é
versionado — cada app tem seu próprio `.env.example` documentando as variáveis esperadas.

## Money & datas

Valores monetários são sempre inteiros em centavos (nunca `float`). Datas são armazenadas em UTC
(`timestamptz`).

## Status

Fase 1 do plano de implementação: monorepo, ambientes, banco/migrations iniciais, auth/roles,
segurança (RLS) e CI básica. Veja o histórico de commits e o changelog de fases para o progresso
detalhado.
