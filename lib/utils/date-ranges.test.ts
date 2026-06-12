import { describe, it, expect } from "vitest";
import {
  addDays,
  diffDays,
  rangeLastDays,
  rangeLastFullDays,
  capToYesterday,
  rangePreviousPeriod,
  parseRangeFromSearchParams,
} from "./date-ranges";

describe("addDays / diffDays", () => {
  it("soma e subtrai cruzando mês", () => {
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31");
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
  });
  it("diffDays é inteiro exato", () => {
    expect(diffDays("2026-06-04", "2026-06-10")).toBe(6);
    expect(diffDays("2026-06-10", "2026-06-10")).toBe(0);
  });
});

describe("rangeLastDays", () => {
  it("últimos 7 dias terminando no today injetado", () => {
    expect(rangeLastDays(7, "2026-06-10")).toEqual({ from: "2026-06-04", to: "2026-06-10" });
  });
  it("1 dia = from == to", () => {
    expect(rangeLastDays(1, "2026-06-10")).toEqual({ from: "2026-06-10", to: "2026-06-10" });
  });
  it("cruza virada de mês sem off-by-one", () => {
    expect(rangeLastDays(7, "2026-06-03")).toEqual({ from: "2026-05-28", to: "2026-06-03" });
  });
});

describe("rangeLastFullDays", () => {
  it("termina ONTEM com N dias completos (bate com Gerenciador)", () => {
    expect(rangeLastFullDays(7, "2026-06-10")).toEqual({ from: "2026-06-03", to: "2026-06-09" });
  });
  it("1 dia completo = só ontem", () => {
    expect(rangeLastFullDays(1, "2026-06-10")).toEqual({ from: "2026-06-09", to: "2026-06-09" });
  });
  it("cruza virada de mês", () => {
    expect(rangeLastFullDays(7, "2026-06-03")).toEqual({ from: "2026-05-27", to: "2026-06-02" });
  });
});

describe("capToYesterday", () => {
  it("corta o fim em ontem quando inclui hoje", () => {
    expect(capToYesterday({ from: "2026-06-08", to: "2026-06-11" }, "2026-06-11")).toEqual({
      from: "2026-06-08",
      to: "2026-06-10",
    });
  });
  it("range já terminando ontem fica intacto", () => {
    expect(capToYesterday({ from: "2026-06-04", to: "2026-06-10" }, "2026-06-11")).toEqual({
      from: "2026-06-04",
      to: "2026-06-10",
    });
  });
  it("range só de hoje (ex.: segunda) vira só ontem", () => {
    expect(capToYesterday({ from: "2026-06-11", to: "2026-06-11" }, "2026-06-11")).toEqual({
      from: "2026-06-10",
      to: "2026-06-10",
    });
  });
});

describe("parseRangeFromSearchParams — cap em ontem", () => {
  it("preset esta-semana nunca inclui hoje (reconcilia com Gerenciador)", () => {
    // hoje = injetado via todayBR mockado? Não dá — então só garante que to < from+hoje.
    // Verificação leve: o range retornado não pode ter to no futuro relativo ao parse.
    const { range } = parseRangeFromSearchParams({ preset: "esta-semana" });
    // to deve ser <= ontem; comparação textual ISO funciona
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(range.to < today).toBe(true);
  });
});

describe("rangePreviousPeriod", () => {
  it("janela anterior de mesmo tamanho, sem overlap", () => {
    expect(rangePreviousPeriod({ from: "2026-06-04", to: "2026-06-10" })).toEqual({
      from: "2026-05-28",
      to: "2026-06-03",
    });
  });
  it("range de 1 dia → dia anterior", () => {
    expect(rangePreviousPeriod({ from: "2026-06-10", to: "2026-06-10" })).toEqual({
      from: "2026-06-09",
      to: "2026-06-09",
    });
  });
});
