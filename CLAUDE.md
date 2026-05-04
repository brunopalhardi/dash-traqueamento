@AGENTS.md

# Dashboard Traqueamento — Contexto do Projeto

Dashboard próprio de tráfego pago + vendas, inspirado no **VK Metrics** (vkmetrics.com). Plano: extrair referências de UI/estrutura do VK e construir versão própria.

## Objetivo

- **Uso primário:** interno (gestão de tráfego do próprio infoproduto do Bruno — "O Bom do Alzheimer")
- **Uso secundário (eventual):** virar SaaS pra outros gestores → arquitetura preparada pra multi-tenant no futuro

## Escopo do MVP

1. **Centralizador de métricas** — Meta Ads (Google Ads em standby pra v2)
2. **Monitoramento por campanha** — CPL, gasto, leads, vendas, dia-a-dia
3. **Análise de criativos** — métricas por anúncio/criativo
4. **Relatórios automáticos** — tráfego, faturamento, conversão, CPL
5. **Match lead → compra** via email/telefone (Hotmart webhook + dados do Meta)

**Fora do MVP:** Lead scoring com ML, Google Ads, TikTok.

## Integrações

- **Meta Ads API** — pull de campanhas, conjuntos, anúncios, métricas
- **Hotmart** — webhook de vendas
- **(futuro)** Google Ads, pesquisa de persona pra lead scoring

## Volume esperado

- 3 contas de anúncio
- Baseline baixo no dia-a-dia
- Pico de ~20k leads/mês em lançamento

## Stack (definida em sub-projeto 1)

- **App:** Next.js 15 + App Router + TypeScript (Vercel)
- **UI:** shadcn/ui + Tailwind, Recharts pra gráficos
- **Banco:** Supabase Postgres + Auth
- **ORM:** Drizzle
- **Worker:** Node.js + BullMQ + Upstash Redis (rodando em VPS BR Hostinger)
- **Multi-tenant:** adiado (single-tenant agora; refator com Rafa quando virar SaaS)

## Time

- **Bruno** mantém sozinho no início (programa, opera tráfego)
- **Rafa** — dev, vizinho do Bruno, possível sócio se virar produto pra terceiros

## Documentação interna

- Spec do sub-projeto 1: [docs/superpowers/specs/2026-05-04-infra-schema-design.md](docs/superpowers/specs/2026-05-04-infra-schema-design.md)
- Plano sub-projeto 1: [docs/superpowers/plans/2026-05-04-infra-schema.md](docs/superpowers/plans/2026-05-04-infra-schema.md)

## Estado atual

- Sub-projeto 1 (Infra + Schema): **em andamento — Task 1**
- Próximos: Meta Ads API → Frontend dados reais → Hotmart webhook → Pixel orgânico
