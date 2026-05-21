"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useCallback, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange as RDPDateRange, Locale } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PRESET_LABELS,
  PRESET_ORDER,
  detectPreset,
  type PresetKey,
} from "@/lib/utils/date-ranges";

function shortBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function fromISO(iso: string): Date {
  return new Date(iso + "T12:00:00Z");
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customRange, setCustomRange] = useState<RDPDateRange | undefined>();

  const urlPreset = sp.get("preset") as PresetKey | null;
  const urlStart = sp.get("start");
  const urlEnd = sp.get("end");

  // Inferência do que tá ativo na URL — tem 3 estados possíveis:
  // 1) preset=X (canônico, label do preset)
  // 2) start/end (custom, label = intervalo)
  // 3) nada (default = esta-semana)
  const activeLabel = useMemo(() => {
    if (urlPreset && PRESET_ORDER.includes(urlPreset)) return PRESET_LABELS[urlPreset];
    if (urlStart && urlEnd) {
      // Pode ser que start/end corresponda a algum preset por coincidência —
      // se sim, mostra o label do preset (UX melhor que datas cruas)
      const detected = detectPreset({ from: urlStart, to: urlEnd });
      return detected ? PRESET_LABELS[detected] : `${shortBR(urlStart)} → ${shortBR(urlEnd)}`;
    }
    return PRESET_LABELS["esta-semana"]; // default
  }, [urlPreset, urlStart, urlEnd]);

  const activePresetKey = useMemo(() => {
    if (urlPreset && PRESET_ORDER.includes(urlPreset)) return urlPreset;
    if (urlStart && urlEnd) return detectPreset({ from: urlStart, to: urlEnd });
    return "esta-semana" as PresetKey;
  }, [urlPreset, urlStart, urlEnd]);

  const applyPreset = useCallback(
    (preset: PresetKey) => {
      const params = new URLSearchParams(sp);
      params.delete("start");
      params.delete("end");
      params.delete("cycle"); // limpa legacy
      params.set("preset", preset);
      router.push(`${pathname}?${params.toString()}`);
      setOpen(false);
    },
    [sp, pathname, router],
  );

  const applyCustom = useCallback(() => {
    if (!customRange?.from || !customRange?.to) return;
    const params = new URLSearchParams(sp);
    params.delete("preset");
    params.delete("cycle");
    params.set("start", toISO(customRange.from));
    params.set("end", toISO(customRange.to));
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
    setCustomRange(undefined);
  }, [customRange, sp, pathname, router]);

  // Inicializa o range do calendário com o intervalo URL atual (se houver)
  const initialCalendarRange: RDPDateRange | undefined =
    customRange ??
    (urlStart && urlEnd
      ? { from: fromISO(urlStart), to: fromISO(urlEnd) }
      : undefined);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-card text-sm hover:bg-card/80 transition-colors">
        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{activeLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex">
          <div className="flex flex-col gap-0.5 p-2 border-r border-border/60 min-w-[160px]">
            {PRESET_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={cn(
                  "text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors",
                  activePresetKey === key && "text-primary font-medium bg-primary/10",
                )}
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          <div className="p-2">
            <Calendar
              mode="range"
              selected={initialCalendarRange}
              onSelect={setCustomRange}
              numberOfMonths={1}
              locale={ptBR as Locale}
              weekStartsOn={1}
              className="bg-transparent"
            />
            <div className="flex items-center justify-between gap-2 px-1 pt-2 border-t border-border/60 mt-2">
              <span className="text-[11px] text-muted-foreground">
                {customRange?.from && customRange?.to
                  ? `${shortBR(toISO(customRange.from))} → ${shortBR(toISO(customRange.to))}`
                  : "Selecione um intervalo"}
              </span>
              <Button
                size="sm"
                onClick={applyCustom}
                disabled={!customRange?.from || !customRange?.to}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
