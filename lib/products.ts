/**
 * Lógica de catálogo de produtos (interface, getters, detecção por campanha).
 *
 * O CATÁLOGO em si (marca, produtos, contas Meta, regex, visual) vive em
 * `lib/client-config.ts` — esse é o ÚNICO arquivo a editar ao clonar pra outro
 * cliente. Aqui ficam só os tipos e as funções que consomem o catálogo.
 *
 * Cada dashboard filtra campanhas por: conta Meta + regex no nome da campanha.
 * Se a nomenclatura mudar, ajusta em `client-config.ts` — dashes/queries/sidebar
 * leem daqui.
 */

import { CLIENT_PRODUCTS } from "@/lib/client-config";

export type { ProductSlug } from "@/lib/client-config";
import type { ProductSlug } from "@/lib/client-config";

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
  /** Rota do dashboard do produto; null = sem página própria */
  href: string | null;
  /** Tag visual na home (ex.: "PERPÉTUO") */
  tagLabel: string;
  /** Classes Tailwind do card na home */
  rail: string;
  tagBg: string;
  tagText: string;
  /** Badge no item do sidebar (ex.: ATIVO) */
  navBadge?: { text: string; tone: "good" | "warn" | "bad" };
  /** Aparece na navegação? (produto pausado = false) */
  showInNav: boolean;
  /** Produto tem grupo WhatsApp (coluna "no grupo", painel SendFlow)? */
  hasWhatsAppGroup: boolean;
}

export const PRODUCTS: Product[] = CLIENT_PRODUCTS;

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
