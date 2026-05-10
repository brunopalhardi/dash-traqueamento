/**
 * Catálogo de produtos do Bruno (O Bom do Alzheimer).
 *
 * Cada dashboard filtra campanhas por: conta Meta + regex no nome da campanha.
 * Se a nomenclatura mudar, ajusta aqui — os dashes/queries/sidebar leem daqui.
 */

export type ProductSlug = "geral" | "c1" | "desafio" | "sono" | "guia" | "lancamento";

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
    description: "Visão consolidada de todos os produtos",
    metaAccountId: null,
    namePattern: null,
    accent: "violet-500",
    defaultRangeDays: 7,
  },
  {
    slug: "c1",
    label: "C1 — Atração",
    shortLabel: "C1",
    description: "Anúncios de atração de seguidores ([C1] Post do Instagram)",
    metaAccountId: "act_1394993860878989",
    namePattern: /\[C1\]/i,
    accent: "sky-500",
    defaultRangeDays: 30,
  },
  {
    slug: "desafio",
    label: "Desafio",
    shortLabel: "Desafio",
    description: "Vendas do desafio semanal (ciclo seg→dom)",
    metaAccountId: "act_1394993860878989",
    namePattern: /VENDAS-DESAFIO/i,
    accent: "fuchsia-500",
    defaultRangeDays: 7, // semana corrente; o dash usa lógica própria
  },
  {
    slug: "sono",
    label: "Protocolo do Sono",
    shortLabel: "Sono",
    description: "Produto perpétuo de menor ticket",
    metaAccountId: "act_972744231680763",
    namePattern: /PERPETUO-SONO|PROTOCOLO.*SONO/i,
    accent: "indigo-500",
    defaultRangeDays: 30,
  },
  {
    slug: "guia",
    label: "Guia",
    shortLabel: "Guia",
    description: "Produto perpétuo, ticket maior",
    metaAccountId: "act_972744231680763",
    namePattern: /PERPETUO-GUIA|GUIA.*OBA/i,
    accent: "amber-500",
    defaultRangeDays: 30,
  },
  {
    slug: "lancamento",
    label: "Lançamento (em standby)",
    shortLabel: "Lançamento",
    description: "Lançamentos numerados [OBA<n>] — em desenvolvimento",
    metaAccountId: "act_1394993860878989",
    namePattern: /\[OBA\d+\]/i,
    accent: "rose-500",
    defaultRangeDays: 30,
  },
];

export function getProduct(slug: ProductSlug): Product {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`Produto desconhecido: ${slug}`);
  return p;
}

export function getDashboardProducts(): Product[] {
  // Lançamento ainda não vai pra sidebar (standby)
  return PRODUCTS.filter((p) => p.slug !== "lancamento");
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
