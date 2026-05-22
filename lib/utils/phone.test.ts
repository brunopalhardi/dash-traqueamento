import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("retorna null pra input vazio/null/undefined", () => {
    expect(normalizePhone(undefined)).toBe(null);
    expect(normalizePhone(null)).toBe(null);
    expect(normalizePhone("")).toBe(null);
    expect(normalizePhone("   ")).toBe(null);
  });

  it("retorna null pra menos de 10 dígitos", () => {
    expect(normalizePhone("123")).toBe(null);
    expect(normalizePhone("99999999")).toBe(null);
  });

  it("adiciona prefixo 55 quando não tem", () => {
    expect(normalizePhone("11987654321")).toBe("5511987654321");
  });

  it("preserva 55 quando já tem", () => {
    expect(normalizePhone("5511987654321")).toBe("5511987654321");
  });

  it("strip caracteres não-numéricos", () => {
    expect(normalizePhone("+55 (11) 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("11 98765-4321")).toBe("5511987654321");
  });

  it("remove 0 extra após DDI (formato discagem 0DDD)", () => {
    expect(normalizePhone("550AABBBBBBBB".replace("AA", "19").replace("BBBBBBBB", "98765-4321".replace(/\D/g, ""))))
      .toBe("5519987654321");
    expect(normalizePhone("55019989881931")).toBe("5519989881931");
    expect(normalizePhone("55085998073331")).toBe("5585998073331");
  });

  it("adiciona 9 prefix em celular BR (formato antigo 12 dígitos)", () => {
    // CSV SendFlow: 558199399329 (8 dígitos no número) → +5581999399329
    expect(normalizePhone("558199399329")).toBe("5581999399329");
    expect(normalizePhone("552499905565")).toBe("5524999905565");
  });

  it("combina remoção de 0 + adição de 9", () => {
    expect(normalizePhone("5502499905565")).toBe("5524999905565");
  });

  it("NÃO adiciona 9 em fixo (5/4/3/2 não-celular)", () => {
    // Fixo BR começa com 2-5. Manter como vem.
    expect(normalizePhone("551132554455")).toBe("551132554455"); // SP fixo
    expect(normalizePhone("552133554455")).toBe("552133554455"); // RJ fixo
  });

  it("buyer Ana Maria (Hotmart) bate com CSV SendFlow", () => {
    const hotmart = normalizePhone("+55 81 99939-9329"); // Webhook checkout_phone
    const csv = normalizePhone("558199399329"); // CSV export SendFlow
    expect(hotmart).toBe(csv);
    expect(hotmart).toBe("5581999399329");
  });
});
