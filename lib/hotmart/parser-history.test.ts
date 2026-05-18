import { describe, it, expect } from "vitest";
import { parseSalesHistoryItem } from "./parser-history";

function makeItem(status: string, overrides: Record<string, unknown> = {}) {
  return {
    product: { id: 1, name: "Desafio 7 Dias Alzheimer" },
    buyer: {
      name: "Maria Silva",
      email: "maria@example.com",
      checkout_phone: "+5511987654321",
    },
    purchase: {
      transaction: "HP-HIST-1",
      approved_date: 1735689600000,
      status,
      price: { value: 197, currency_value: "BRL" },
      ...((overrides.purchase as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

describe("parseSalesHistoryItem", () => {
  it("status APPROVED → ParsedPurchase com status approved", () => {
    const result = parseSalesHistoryItem(makeItem("APPROVED"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe("approved");
    expect(result!.event).toBe("PURCHASE_APPROVED");
    expect(result!.transactionId).toBe("HP-HIST-1");
    expect(result!.productSlug).toBe("desafio");
    expect(result!.buyerPhoneE164).toBe("5511987654321");
    expect(result!.valueCents).toBe(19700);
  });

  it("status REFUNDED → status refunded", () => {
    expect(parseSalesHistoryItem(makeItem("REFUNDED"))!.status).toBe("refunded");
  });

  it("status CHARGEBACK → status chargeback", () => {
    expect(parseSalesHistoryItem(makeItem("CHARGEBACK"))!.status).toBe("chargeback");
  });

  it("status não suportado retorna null (STARTED, WAITING_PAYMENT, EXPIRED, etc)", () => {
    for (const s of [
      "STARTED",
      "WAITING_PAYMENT",
      "EXPIRED",
      "CANCELED",
      "COMPLETE",
      "DELAYED",
      "NO_FUNDS",
      "OVERDUE",
      "BLOCKED",
      "PROTEST",
      "BILLET_PRINTED",
    ]) {
      expect(parseSalesHistoryItem(makeItem(s))).toBeNull();
    }
  });

  it("aceita status em lowercase ou mixed-case", () => {
    expect(parseSalesHistoryItem(makeItem("approved"))!.status).toBe("approved");
    expect(parseSalesHistoryItem(makeItem("Refunded"))!.status).toBe("refunded");
  });

  it("retorna null pra item sem purchase.status", () => {
    const noStatus = makeItem("APPROVED", {
      purchase: { transaction: "X", approved_date: 1 },
    });
    expect(parseSalesHistoryItem(noStatus)).toBeNull();
  });

  it("retorna null pra entrada inválida (não objeto)", () => {
    expect(parseSalesHistoryItem(null)).toBeNull();
    expect(parseSalesHistoryItem("string")).toBeNull();
    expect(parseSalesHistoryItem(42)).toBeNull();
  });
});
