/**
 * Catálogo de produtos do Bruno (O Bom do Alzheimer).
 *
 * Cada dashboard filtra campanhas por: conta Meta + regex no nome da campanha.
 * Se a nomenclatura mudar, ajusta aqui — os dashes/queries/sidebar leem daqui.
 */

export type ProductSlug = "geral" | "desafio" | "guia";

export interface Product {
  slug: ProductSlug;
  label: string;
  shortLabel: string;
  description: string;
  /** ID Meta da conta de anúncios (formato `act_…`); null = todas */
  metaAccountId: string | null;
  /** Regex aplicada ao nome da campanha. null no "geral" = sem filtro */
  namePattern: RegExp | null;
  /** Cor accent (Tailwind class fragment, ex.: "violet-500") */
  accent: string;
  /** Default de período em dias (Desafio é tratado à parte) */
  defaultRangeDays: number;
}

export const PRODUCTS: Product[] = [
  {
    slug: "geral",
    label: "Geral",
    shortLabel: "Geral",
    description: "Visão consolidada de Desafio e Guia",
    metaAccountId: null,
    namePattern: null,
    accent: "violet-500",
    defaultRangeDays: 7,
  },
  {
    slug: "desafio",
    label: "Desafio",
    shortLabel: "Desafio",
    description: "Vendas do desafio semanal (ciclo seg→dom)",
    metaAccountId: "act_1394993860878989",
    namePattern: /VENDAS-DESAFIO/i,
    accent: "fuchsia-500",
    defaultRangeDays: 7,
  },
  {
    slug: "guia",
    label: "Guia",
    shortLabel: "Guia",
    description: "Produto perpétuo, ticket maior",
    metaAccountId: "act_972744231680763",
    // Nomenclatura do Bruno: campanhas do Guia usam o prefixo PERPETUO-GA
    // (GA = Guia do Alzheimer), divididas por grupo (ex.: -GRUPO-EXAUSTÃO-*),
    // mais o remarketing PERPETUO-GUIA-F-*. NÃO inclui os posts [C1] do
    // Instagram — esses caem como gasto geral no dash Geral.
    namePattern: /PERPETUO-GA|PERPETUO-GUIA|GUIA.*OBA/i,
    accent: "amber-500",
    defaultRangeDays: 30,
  },
];

export function getProduct(slug: ProductSlug): Product {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`Produto desconhecido: ${slug}`);
  return p;
}

export function getDashboardProducts(): Product[] {
  return PRODUCTS;
}

/**
 * Retorna o produto que melhor corresponde ao nome+conta de uma campanha.
 * Usado pela tabela "Por produto" no dash Geral. Tem precedência: o primeiro
 * pattern que casar (na ordem de PRODUCTS, exceto "geral") vence.
 */
export function detectProduct(
  campaignName: string,
  metaAccountId: string,
): ProductSlug | "outros" {
  for (const p of PRODUCTS) {
    if (p.slug === "geral") continue;
    if (p.metaAccountId && p.metaAccountId !== metaAccountId) continue;
    if (p.namePattern && p.namePattern.test(campaignName)) return p.slug;
  }
  return "outros";
}

/**
 * Mapa de produto da Hotmart → slug do dashboard, por IDENTIDADE do produto
 * (id do produto na Hotmart + nome EXATO como fallback).
 *
 * NÃO usa substring: a palavra "guia" aparece em produtos distintos que NÃO são
 * o Guia do Alzheimer (e-book "Higiene do Sono - Guia prático", "Guia de Viagem"),
 * e um produto do Guia com nome sem "guia" sumiria. Sem match → "outros".
 *
 * O id só vem nos payloads recentes (webhook v2); o histórico (sync via Sales
 * History API) frequentemente traz só o nome — por isso o nome exato é a chave
 * de fallback confiável. Pra adicionar um produto novo, inclua o id (preferido)
 * e/ou o nome exato aqui.
 */
interface HotmartProduct {
  slug: Exclude<ProductSlug, "geral">;
  /** ids do produto na Hotmart (`data.product.id`) */
  hotmartIds: string[];
  /** nomes exatos do produto (comparados com trim, case-insensitive) */
  names: string[];
}

const HOTMART_PRODUCTS: HotmartProduct[] = [
  {
    slug: "guia",
    hotmartIds: ["6753137"],
    names: ["GUIA ALZHEIMER - O PRIMEIRO PASSO PARA CUIDAR"],
  },
  {
    slug: "desafio",
    hotmartIds: ["7523998"],
    names: ["Desafio O Bom do Alzheimer"],
  },
];

/**
 * Classifica uma compra Hotmart no slug do dashboard. Prefere o id do produto;
 * cai pro nome exato (trim, case-insensitive) quando o id não vem no payload.
 */
export function classifyPurchaseProduct(
  productId: string | null | undefined,
  productName: string | null | undefined,
): ProductSlug | "outros" {
  const id = productId != null ? String(productId).trim() : "";
  if (id) {
    for (const p of HOTMART_PRODUCTS) {
      if (p.hotmartIds.includes(id)) return p.slug;
    }
  }
  const name = productName != null ? productName.trim().toLowerCase() : "";
  if (name) {
    for (const p of HOTMART_PRODUCTS) {
      if (p.names.some((n) => n.toLowerCase() === name)) return p.slug;
    }
  }
  return "outros";
}
