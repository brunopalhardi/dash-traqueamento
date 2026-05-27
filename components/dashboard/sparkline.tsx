/**
 * Sparkline SVG mínimo. Recebe array de números e desenha linha + área
 * com gradient. Ponto destacado no último valor.
 */
export function Sparkline({
  values,
  color,
  height = 40,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length < 2) {
    return (
      <div
        className="w-full bg-white/[0.02] rounded"
        style={{ height }}
        aria-hidden
      />
    );
  }

  const W = 200;
  const H = height;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = W / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = H - 4 - ((v - min) / range) * (H - 8);
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const last = points[points.length - 1];

  const gradId = `spark-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} opacity={0.5} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill={color} />
    </svg>
  );
}
