import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases } from "@/lib/schema/purchases";
import { whatsappGroupMembers } from "@/lib/schema/whatsapp";
import type { ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

export interface BuyerRow {
  transactionId: string;
  purchasedAt: Date;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhoneE164: string | null;
  valueCents: number | null;
  /** true se está em algum grupo agora, false se está mas saiu, null se telefone faltou */
  inGroup: boolean | null;
}

/**
 * Retorna compradores aprovados de um produto dentro de um período.
 * Faz LEFT JOIN com whatsapp_group_members.phone_normalized pra resolver inGroup.
 * Se buyer_phone_e164 for null, inGroup = null (não rotula como "fora").
 */
export async function getBuyersForCycle(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<BuyerRow[]> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");

  const rows = await db
    .select({
      transactionId: purchases.transactionId,
      purchasedAt: purchases.purchasedAt,
      buyerName: purchases.buyerName,
      buyerEmail: purchases.buyerEmail,
      buyerPhoneE164: purchases.buyerPhoneE164,
      valueCents: purchases.valueCents,
      inGroupAny: sql<boolean | null>`
        case
          when ${purchases.buyerPhoneE164} is null then null
          else exists(
            select 1 from ${whatsappGroupMembers}
            where ${whatsappGroupMembers.phoneNormalized} = ${purchases.buyerPhoneE164}
              and ${whatsappGroupMembers.currentlyInGroup} = true
          )
        end
      `,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    )
    .orderBy(sql`${purchases.purchasedAt} desc`);

  return rows.map((r) => ({
    transactionId: r.transactionId,
    purchasedAt: r.purchasedAt,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhoneE164: r.buyerPhoneE164,
    valueCents: r.valueCents,
    inGroup: r.inGroupAny,
  }));
}
