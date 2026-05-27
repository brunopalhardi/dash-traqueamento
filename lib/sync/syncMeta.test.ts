import { describe, it, expect } from "vitest";
import { syncMeta, extractConversions } from "./syncMeta";
import type { MetaInsight } from "../meta/types";

describe("syncMeta", () => {
  it("exports a function", () => {
    expect(typeof syncMeta).toBe("function");
  });
});

describe("extractConversions", () => {
  function insight(actions: { action_type: string; value: string }[]): MetaInsight {
    return {
      ad_id: "1",
      date_start: "2026-05-26",
      date_stop: "2026-05-26",
      actions,
    };
  }

  it("extrai landing_page_view do action_type nativo", () => {
    const c = extractConversions(
      insight([{ action_type: "landing_page_view", value: "144" }]),
    );
    expect(c.landing_page_view).toBe(144);
  });

  it("ignora fb_pixel_view_content (ViewContent é evento distinto de LPV)", () => {
    // Validado contra Looker Studio: incluir view_content inflava o número
    // (260 vs 144 esperado em 2026-05-26 no /guia).
    const c = extractConversions(
      insight([{ action_type: "offsite_conversion.fb_pixel_view_content", value: "97" }]),
    );
    expect(c.landing_page_view).toBe(0);
  });

  it("extrai initiate_checkout escolhendo omni quando disponível (sem somar duplicadas)", () => {
    const c = extractConversions(
      insight([
        { action_type: "omni_initiated_checkout", value: "8" },
        { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: "8" },
        { action_type: "initiate_checkout", value: "8" },
      ]),
    );
    expect(c.initiate_checkout).toBe(8);
  });

  it("usa fallback de prioridade quando omni_initiated_checkout não está presente", () => {
    const c = extractConversions(
      insight([
        { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: "4" },
      ]),
    );
    expect(c.initiate_checkout).toBe(4);
  });

  it("retorna 0 para landing_page_view e initiate_checkout quando ausentes", () => {
    const c = extractConversions(insight([{ action_type: "lead", value: "5" }]));
    expect(c.landing_page_view).toBe(0);
    expect(c.initiate_checkout).toBe(0);
    expect(c.lead).toBe(5);
  });

  it("preserva chaves existentes (purchase, lead, revenue) ao adicionar novas", () => {
    const c = extractConversions({
      ad_id: "1",
      date_start: "2026-05-26",
      date_stop: "2026-05-26",
      actions: [
        { action_type: "lead", value: "10" },
        { action_type: "omni_purchase", value: "2" },
        { action_type: "landing_page_view", value: "144" },
        { action_type: "omni_initiated_checkout", value: "8" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "397.00" }],
    });
    expect(c).toMatchObject({
      lead: 10,
      purchase: 2,
      revenue: 397,
      landing_page_view: 144,
      initiate_checkout: 8,
    });
  });
});
