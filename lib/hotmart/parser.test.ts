import { describe, it, expect } from "vitest";
import { parsePurchasePayload } from "./parser";

const samplePayload = {
  event: "PURCHASE_APPROVED",
  data: {
    product: { id: 1234567, name: "Desafio 7 Dias Alzheimer" },
    buyer: {
      name: "Maria Silva",
      email: "maria@example.com",
      checkout_phone: "+55 11 98765-4321",
    },
    purchase: {
      transaction: "HP1234567890",
      status: "APPROVED",
      approved_date: 1735689600000,
      price: { value: 197.0, currency_value: "BRL" },
    },
  },
};

describe("parsePurchasePayload", () => {
  it("extrai campos básicos de um PURCHASE_APPROVED", () => {
    const result = parsePurchasePayload(samplePayload);
    expect(result).not.toBeNull();
    expect(result!.transactionId).toBe("HP1234567890");
    expect(result!.event).toBe("PURCHASE_APPROVED");
    expect(result!.status).toBe("approved");
    expect(result!.buyerName).toBe("Maria Silva");
    expect(result!.buyerEmail).toBe("maria@example.com");
    expect(result!.buyerPhoneRaw).toBe("+55 11 98765-4321");
    expect(result!.buyerPhoneE164).toBe("5511987654321");
    expect(result!.valueCents).toBe(19700);
    expect(result!.currency).toBe("BRL");
    expect(result!.productNameRaw).toBe("Desafio 7 Dias Alzheimer");
    expect(result!.purchasedAt).toBeInstanceOf(Date);
  });

  it("mapeia PURCHASE_REFUNDED pra status refunded", () => {
    const result = parsePurchasePayload({ ...samplePayload, event: "PURCHASE_REFUNDED" });
    expect(result!.status).toBe("refunded");
  });

  it("mapeia PURCHASE_CHARGEBACK pra status chargeback", () => {
    const result = parsePurchasePayload({ ...samplePayload, event: "PURCHASE_CHARGEBACK" });
    expect(result!.status).toBe("chargeback");
  });

  it("retorna null se faltar transaction_id", () => {
    const bad = {
      event: "PURCHASE_APPROVED",
      data: { ...samplePayload.data, purchase: { ...samplePayload.data.purchase, transaction: undefined } },
    };
    expect(parsePurchasePayload(bad)).toBeNull();
  });

  it("aceita event no root e telefone em formato bruto sem +", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        buyer: { ...samplePayload.data.buyer, checkout_phone: "11987654321" },
      },
    });
    expect(result!.buyerPhoneE164).toBe("5511987654321");
  });

  it("classifica produto via regex do products.ts (desafio)", () => {
    const result = parsePurchasePayload(samplePayload);
    expect(result!.productSlug).toBe("desafio");
  });

  it("classifica produto Guia", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: {
        ...samplePayload.data,
        product: { id: 999, name: "Guia Completo do Alzheimer" },
      },
    });
    expect(result!.productSlug).toBe("guia");
  });

  it("retorna 'outros' quando produto não casa", () => {
    const result = parsePurchasePayload({
      ...samplePayload,
      data: { ...samplePayload.data, product: { id: 999, name: "Produto Random" } },
    });
    expect(result!.productSlug).toBe("outros");
  });
});
