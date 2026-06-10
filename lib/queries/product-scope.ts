import { eq, type SQL } from "drizzle-orm";
import { campaigns } from "@/lib/schema";
import type { Product } from "@/lib/products";

/**
 * Filtro de produto pra queries de insights.
 * A atribuição é persistida em campaigns.product_slug pelo sync (detectProduct)
 * — fonte única; nada de re-derivar regex em LIKE por query.
 */
export function productScopeWhere(product: Product): SQL[] {
  if (product.slug === "geral") return [];
  return [eq(campaigns.productSlug, product.slug)];
}
