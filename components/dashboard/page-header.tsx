import { DateRangePicker } from "./date-range-picker";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rangeDays?: number;
  /** Some dashes (Desafio) usam range próprio — esconde o picker */
  hidePicker?: boolean;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, rangeDays, hidePicker, right }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {right}
        {hidePicker ? null : <DateRangePicker defaultDays={rangeDays} />}
      </div>
    </header>
  );
}
