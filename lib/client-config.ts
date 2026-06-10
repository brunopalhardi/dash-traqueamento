/**
 * ÚNICO arquivo a editar ao clonar o dashboard pra outro cliente
 * (além das env vars — ver .env.example).
 *
 * Tudo que é específico do negócio mora aqui: marca, produtos, contas Meta,
 * regex de nomenclatura de campanha, visual. O resto do código lê daqui
 * via lib/products.ts.
 */
import type { Product } from "@/lib/products";

/** Slugs dos produtos deste cliente. "geral" é obrigatório. */
export type ProductSlug = "geral" | "desafio" | "guia";

export const BRAND = {
  /** Iniciais no quadradinho do sidebar */
  initials: "OBA",
  name: "Traqueamento",
  subtitle: "tráfego pago + vendas",
};

export const CLIENT_PRODUCTS: Product[] = [
  {
    slug: "geral",
    label: "Geral",
    shortLabel: "Geral",
    description: "Visão consolidada de Desafio e Guia",
    metaAccountId: null,
    namePattern: null,
    accent: "violet-500",
    defaultRangeDays: 7,
    href: null,
    tagLabel: "GERAL",
    rail: "bg-muted-foreground/30",
    tagBg: "bg-muted",
    tagText: "text-muted-foreground",
    showInNav: false,
    hasWhatsAppGroup: false,
  },
  {
    slug: "desafio",
    label: "Desafio",
    shortLabel: "Desafio",
    description: "vendas do desafio semanal · ciclo seg→dom",
    metaAccountId: "act_1394993860878989",
    namePattern: /VENDAS-DESAFIO/i,
    accent: "fuchsia-500",
    defaultRangeDays: 7,
    href: "/desafio",
    tagLabel: "SEMANAL · DESATIVADO",
    rail: "bg-pink-500",
    tagBg: "bg-pink-500/15",
    tagText: "text-pink-300",
    showInNav: false,
    hasWhatsAppGroup: true,
  },
  {
    slug: "guia",
    label: "Guia",
    shortLabel: "Guia",
    description: "produto perpétuo · ticket maior",
    metaAccountId: "act_972744231680763",
    // Nomenclatura: campanhas do Guia usam prefixo PERPETUO-GA (GA = Guia do
    // Alzheimer), divididas por grupo (-GRUPO-EXAUSTÃO-*), mais remarketing
    // PERPETUO-GUIA-F-*. Posts [C1] do Instagram NÃO entram (caem em outros).
    namePattern: /PERPETUO-GA|PERPETUO-GUIA|GUIA.*OBA/i,
    accent: "amber-500",
    defaultRangeDays: 30,
    href: "/guia",
    tagLabel: "PERPÉTUO",
    rail: "bg-purple-500",
    tagBg: "bg-purple-500/15",
    tagText: "text-purple-300",
    navBadge: { text: "ATIVO", tone: "good" },
    showInNav: true,
    hasWhatsAppGroup: false,
  },
];
