import type { SeriesPoint } from "@/lib/admin/dashboard";

/**
 * Server-rendered single-series column chart (no client library): thin
 * columns with a rounded data-end and a 2px surface gap, hairline gridlines,
 * clean ticks, the maximum directly labelled, a native hover title per column
 * and a visually hidden table as the non-visual reading of the same data.
 */
const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 24, right: 12, bottom: 30, left: 60 };

function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / 10 ** exponent;
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return nice * 10 ** exponent;
}

export function chartTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const step = niceStep(max / count);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 1e6) / 1e6);
  return ticks;
}

export function BarChart({
  id,
  title,
  data,
  format,
  emptyLabel,
  tableCaption,
}: {
  id: string;
  title: string;
  data: SeriesPoint[];
  format: (value: number) => string;
  emptyLabel: string;
  tableCaption: string;
}) {
  const max = Math.max(0, ...data.map((point) => point.value));
  const ticks = chartTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = data.length ? plotWidth / data.length : plotWidth;
  const barWidth = Math.min(24, Math.max(3, slot - 2));
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const maxIndex = data.findIndex((point) => point.value === max);
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;

  return (
    <figure className="rounded-card border border-light-2 bg-white p-5" data-chart={id}>
      <figcaption id={`${id}-title`} className="text-sm font-medium text-dark-1">{title}</figcaption>
      {max <= 0 ? (
        <p className="mt-6 text-sm text-mid-2">{emptyLabel}</p>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={`${id}-title`}
          className="mt-3 h-auto w-full"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-light-2" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} className="fill-mid-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(tick)}
              </text>
            </g>
          ))}
          {data.map((point, index) => {
            const x = PAD.left + index * slot + (slot - barWidth) / 2;
            const height = (point.value / top) * plotHeight;
            const radius = Math.min(4, height / 2);
            const yTop = y(point.value);
            const path = height <= 0
              ? null
              : `M${x},${yTop + radius} a${radius},${radius} 0 0 1 ${radius},-${radius} h${barWidth - 2 * radius} a${radius},${radius} 0 0 1 ${radius},${radius} v${height - radius} h-${barWidth} z`;
            return (
              <g key={`${point.label}-${index}`}>
                {path ? <path d={path} className="fill-brand" /> : null}
                <rect x={PAD.left + index * slot} y={PAD.top} width={slot} height={plotHeight} fill="transparent">
                  <title>{`${point.label}: ${format(point.value)}`}</title>
                </rect>
                {index === maxIndex && height > 0 ? (
                  <text x={x + barWidth / 2} y={yTop - 6} textAnchor="middle" fontSize={11} className="fill-dark-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {format(point.value)}
                  </text>
                ) : null}
                {index % labelEvery === 0 ? (
                  <text x={x + barWidth / 2} y={HEIGHT - 10} textAnchor="middle" fontSize={11} className="fill-mid-1">
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight} className="stroke-light-1" strokeWidth={1} />
        </svg>
      )}
      <table className="sr-only">
        <caption>{tableCaption}: {title}</caption>
        <tbody>
          {data.map((point, index) => (
            <tr key={`${point.label}-${index}`}>
              <th scope="row">{point.label}</th>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
