/**
 * Presets de período em fuso BR (America/Sao_Paulo).
 *
 * Usar string YYYY-MM-DD evita armadilhas de fuso: o servidor da Vercel roda
 * em UTC e `new Date()` lá pode estar num dia diferente do Bruno. Aqui a
 * gente sempre derive "hoje BR" via Intl.DateTimeFormat, e faz aritmética
 * de datas via UTC noon (12:00Z) — esse offset cabe dentro do dia BR mesmo
 * em horários de virada.
 *
 * Semana começa na segunda (padrão BR).
 */

import type { DateRange } from "@/lib/queries/dashboard";

const TZ = "America/Sao_Paulo";

/** YYYY-MM-DD da data corrente em fuso BR. */
export function todayBR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Parse "YYYY-MM-DD" como noon UTC — evita virar dia anterior em fusos a oeste. */
function parseISO(iso: string): Date {
  return new Date(iso + "T12:00:00Z");
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Dia da semana em fuso BR: 0=dom, 1=seg, …, 6=sáb. */
function dayOfWeek(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Diferença em dias inteiros entre duas datas ISO (to - from). */
export function diffDays(fromISO: string, toISO_: string): number {
  return Math.round((parseISO(toISO_).getTime() - parseISO(fromISO).getTime()) / 86_400_000);
}

/** Últimos N dias terminando hoje (fuso BR). `today` injetável pra teste. */
export function rangeLastDays(days: number, today = todayBR()): DateRange {
  return { from: addDays(today, -(days - 1)), to: today };
}

/**
 * Últimos N dias COMPLETOS — termina ONTEM, não hoje.
 * O sync do Meta usa presets last_Nd que excluem o dia corrente, então o banco
 * nunca tem "hoje" fechado; janela até ontem bate 1:1 com o "últimos 7 dias"
 * do Gerenciador de Anúncios (que também termina ontem).
 */
export function rangeLastFullDays(days: number, today = todayBR()): DateRange {
  const yesterday = addDays(today, -1);
  return { from: addDays(yesterday, -(days - 1)), to: yesterday };
}

/**
 * Limita o fim do range a ONTEM (fuso BR) — o dia corrente nunca tem gasto
 * completo no banco (sync Meta usa presets last_Nd que excluem hoje). Capar
 * deixa o rótulo honesto: "08→10 jun" em vez de "08→11" com o 11 vazio, e
 * passa a reconciliar 1:1 com o Gerenciador setado no mesmo intervalo.
 * Se o range inteiro for hoje (ex.: segunda de manhã), vira só ontem.
 */
export function capToYesterday(range: DateRange, today = todayBR()): DateRange {
  const yesterday = addDays(today, -1);
  const to = range.to > yesterday ? yesterday : range.to;
  const from = range.from > to ? to : range.from;
  return { from, to };
}

/** Período imediatamente anterior, de mesmo tamanho, sem overlap. */
export function rangePreviousPeriod(range: DateRange): DateRange {
  const days = diffDays(range.from, range.to) + 1;
  const prevTo = addDays(range.from, -1);
  return { from: addDays(prevTo, -(days - 1)), to: prevTo };
}

/** Segunda da semana corrente → hoje. */
export function thisWeek(today = todayBR()): DateRange {
  const dow = dayOfWeek(today);
  // Se hoje é domingo (dow=0) a semana corrente começou faz 6 dias.
  // Caso contrário, segunda foi (dow - 1) dias atrás.
  const offsetToMonday = dow === 0 ? -6 : -(dow - 1);
  return { from: addDays(today, offsetToMonday), to: today };
}

/** Segunda → domingo da semana anterior completa. */
export function lastWeek(today = todayBR()): DateRange {
  const dow = dayOfWeek(today);
  const offsetToMonday = dow === 0 ? -6 : -(dow - 1);
  const lastSunday = addDays(today, offsetToMonday - 1);
  const lastMonday = addDays(lastSunday, -6);
  return { from: lastMonday, to: lastSunday };
}

/** Dia 1 do mês corrente → hoje. */
export function thisMonth(today = todayBR()): DateRange {
  const [y, m] = today.split("-");
  return { from: `${y}-${m}-01`, to: today };
}

/** Dia 1 → último dia do mês anterior completo. */
export function lastMonth(today = todayBR()): DateRange {
  const [yStr, mStr] = today.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevMPad = String(prevM).padStart(2, "0");
  // Dia 0 do mês seguinte = último dia do anterior
  const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  return {
    from: `${prevY}-${prevMPad}-01`,
    to: `${prevY}-${prevMPad}-${String(lastDay).padStart(2, "0")}`,
  };
}

export type PresetKey = "esta-semana" | "semana-passada" | "este-mes" | "mes-passado";

export const PRESET_LABELS: Record<PresetKey, string> = {
  "esta-semana": "Esta semana",
  "semana-passada": "Semana passada",
  "este-mes": "Este mês",
  "mes-passado": "Mês passado",
};

export const PRESET_ORDER: PresetKey[] = [
  "esta-semana",
  "semana-passada",
  "este-mes",
  "mes-passado",
];

export function rangeFromPreset(preset: PresetKey, today = todayBR()): DateRange {
  switch (preset) {
    case "esta-semana":
      return thisWeek(today);
    case "semana-passada":
      return lastWeek(today);
    case "este-mes":
      return thisMonth(today);
    case "mes-passado":
      return lastMonth(today);
  }
}

/** Tenta inferir qual preset corresponde a um DateRange (pra destacar no UI). */
export function detectPreset(range: DateRange, today = todayBR()): PresetKey | null {
  for (const key of PRESET_ORDER) {
    const r = rangeFromPreset(key, today);
    if (r.from === range.from && r.to === range.to) return key;
  }
  return null;
}

/**
 * Parsa searchParams da URL na ordem de prioridade:
 *  1. `?preset=esta-semana|semana-passada|este-mes|mes-passado` (canônico novo)
 *  2. `?start=YYYY-MM-DD&end=YYYY-MM-DD` (custom picker)
 *  3. `?cycle=N` (legacy — links antigos não quebram)
 *  4. default: esta semana
 *
 * Retorna a range + um label pra ser usado no header.
 */
export function parseRangeFromSearchParams(sp: {
  preset?: string;
  cycle?: string;
  start?: string;
  end?: string;
}): { range: DateRange; label: string } {
  const result = parseRangeRaw(sp);
  // Cap em ontem: o dia corrente nunca tem gasto Meta completo no banco.
  return { range: capToYesterday(result.range), label: result.label };
}

function parseRangeRaw(sp: {
  preset?: string;
  cycle?: string;
  start?: string;
  end?: string;
}): { range: DateRange; label: string } {
  if (sp.preset && (PRESET_ORDER as string[]).includes(sp.preset)) {
    const key = sp.preset as PresetKey;
    return { range: rangeFromPreset(key), label: PRESET_LABELS[key] };
  }
  if (
    sp.start &&
    sp.end &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.end)
  ) {
    const range = { from: sp.start, to: sp.end };
    // Se o custom range bater por coincidência com algum preset, usa o label do preset
    const detected = detectPreset(range);
    return {
      range,
      label: detected ? PRESET_LABELS[detected] : "Custom",
    };
  }
  if (sp.cycle) {
    const n = Number(sp.cycle);
    if (Number.isFinite(n) && n > 0) {
      const today = todayBR();
      const from = addDays(today, -(n - 1));
      return { range: { from, to: today }, label: `Últimos ${n} dias` };
    }
  }
  return {
    range: rangeFromPreset("esta-semana"),
    label: PRESET_LABELS["esta-semana"],
  };
}
