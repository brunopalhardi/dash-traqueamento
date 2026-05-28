import { DateRangePicker } from "./date-range-picker";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Texto pequeno em mono lowercase acima do título (ex.: "guia · perpétuo") */
  eyebrow?: string;
  rangeDays?: number;
  /** Some dashes (Desafio) usam range próprio — esconde o picker */
  hidePicker?: boolean;
  right?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  rangeDays,
  hidePicker,
  right,
}: PageHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow ? (
            <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mb-2">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-3xl md:text-4xl font-medium leading-tight tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="font-mono text-xs text-muted-foreground/70 mt-2 tabular-nums">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {right}
          {hidePicker ? null : <DateRangePicker defaultDays={rangeDays} />}
        </div>
      </div>
      <div className="h-px mt-5 bg-gradient-to-r from-border to-transparent" />
    </header>
  );
}
