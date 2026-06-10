import { describe, it, expect } from "vitest";
import {
  addDays,
  diffDays,
  rangeLastDays,
  rangeLastFullDays,
  rangePreviousPeriod,
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
