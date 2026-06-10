import { describe, it, expect } from "vitest";
import { detectProduct } from "./products";

const ACCT_GUIA = "act_972744231680763";
const ACCT_DESAFIO = "act_1394993860878989";

describe("detectProduct", () => {
  it("campanhas PERPETUO-GA são guia", () => {
    expect(detectProduct("B-PERPETUO-GA-GRUPO-EXAUSTÃO-A", ACCT_GUIA)).toBe("guia");
  });
  it("remarketing PERPETUO-GUIA é guia", () => {
    expect(detectProduct("B-PERPETUO-GUIA-F-Remarketing Checkout", ACCT_GUIA)).toBe("guia");
  });
  it("GUIA.*OBA casa com separadores no meio (caso que o LIKE antigo perdia)", () => {
    expect(detectProduct("GUIA-NOVO-OBA", ACCT_GUIA)).toBe("guia");
  });
  it("post impulsionado [C1] NÃO é guia (cai em outros)", () => {
    expect(detectProduct("[C1] Post do Instagram: cuidador", ACCT_GUIA)).toBe("outros");
  });
  it("VENDAS-DESAFIO na conta de lançamentos é desafio", () => {
    expect(detectProduct("B-VENDAS-DESAFIO-F-LP1", ACCT_DESAFIO)).toBe("desafio");
  });
  it("nome de desafio na conta errada não atribui", () => {
    expect(detectProduct("B-VENDAS-DESAFIO-F-LP1", ACCT_GUIA)).toBe("outros");
  });
});
