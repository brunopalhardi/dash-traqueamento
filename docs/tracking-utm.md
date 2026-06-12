# Atribuição de venda: orgânico vs pago (UTM/sck)

Como o dashboard sabe se uma venda Hotmart veio de **tráfego pago**, **orgânico** ou ficou **sem atribuição**.

## Como funciona

1. Cada venda carrega um `sck` (ou `utm_*`) que vira a coluna `purchases.traffic_source` via `lib/hotmart/tracking.ts`.
2. Formato do sck: `s=<source>|m=<medium>|c=<campanha>|co=<conteudo>|t=<pago|organico>`.
3. Classificação em 3 baldes:
   - **trafego**: `t=pago`, ou `vsrc=paid_*`, ou tem ad id, ou `s` contém "ads".
   - **organico**: `t=organico`, ou `s` contém "organic".
   - **sem_atribuicao**: sem sck classificável (NÃO é contado como tráfego — não infla CAC).

## De onde vem o sck (as duas pernas de captura)

### 1. Anúncios Meta (tráfego pago) — parâmetros de URL no anúncio
No Gerenciador → anúncio → "Parâmetros de URL", cada campanha precisa ter:

```
sck=s=MetaAds_{{placement}}|m={{adset.name}}|c={{campaign.name}}|co={{ad.name}}|t=pago
```

**Regra crítica:** toda campanha nova precisa desse parâmetro, senão a venda dela cai em "sem atribuição".

> PENDENTE: confirmar o template exato que já está nos anúncios atuais (rodar uma leitura de `url_tags` via API do Meta quando a plataforma estabilizar). Hoje ~17% das vendas já trazem sck, então algo já está configurado — falta documentar a fonte.

### 2. Landing pages (orgânico e captura geral) — snippet t.js
Nas LPs, instalar antes de `</body>`:

```html
<script src="https://dash-traqueamento.vercel.app/t.js" defer></script>
```

O `t.js` captura `?sck=`/`?utm_*` da URL (first-touch, 30 dias) e decora todos os links `pay.hotmart.com` da página. Assim uma venda que sai da LP carrega a origem.

## Links prontos por canal orgânico

Cole estes nos canais (a origem já vai montada):

| Canal | Link |
|---|---|
| Bio Instagram | `<LP>?utm_source=Organico_Bio` |
| Stories | `<LP>?utm_source=Organico_Stories` |
| Grupo WhatsApp (checkout direto) | `<checkout>?sck=s=Organico_Whatsapp\|m=grupo\|t=organico` |
| E-mail | `<LP>?utm_source=Organico_Email` |

Regra: link pra **LP** usa `utm_*` (o t.js converte e repassa); link **direto pro checkout** usa `sck=` já montado.

## Limitações (honestas)
- iOS/Safari apaga localStorage em ~7 dias → first-touch longo se perde.
- Compra em outro device quebra a cadeia.
- A janela WhatsApp depende 100% de link decorado.
- ~5-15% sem atribuição é normal nesse setup. O que importa é acompanhar a fatia sem-atribuição das vendas NOVAS; se passar de ~15%, falta decorar algum canal.
