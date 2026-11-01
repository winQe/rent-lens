import type { QuarterPoint } from '@rent-lens/shared';
import { money } from '../format.ts';
import { useSvgScale } from '../useSvgScale.ts';

const W = 900;
const H = 240;
const RIGHT = 880;
const TOP = 20;
const BOTTOM = 180;

/** A street median from fewer rentals than this in a quarter is noise, so it is not plotted. */
export const MIN_QUARTER_RENTALS = 3;

/** Rough width of a text label in SVG units: 0.6 em per character fits DM Sans digits. */
const textWidth = (text: string, fontSize: number) => text.length * fontSize * 0.6;

/**
 * Splits a series into runs of consecutive points, so the line breaks at missing quarters
 * instead of drawing a straight segment across them as if the data were there.
 */
export function segments(values: (number | null)[]): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push([i, v]);
  });
  if (run.length) runs.push(run);
  return runs;
}

/** Street median vs the Singapore-wide median for the same flat type, by quarter. */
export function TrendChart({ trend, streetLabel }: { trend: QuarterPoint[]; streetLabel: string }) {
  const { ref, px } = useSvgScale(W);
  const street = trend.map((t) => (t.streetRentals >= MIN_QUARTER_RENTALS ? t.streetMedian : null));
  const national = trend.map((t) => t.nationalMedian);

  const values = [...street, ...national].filter((v): v is number => v !== null);
  if (values.length === 0) return <p className="text-muted">No trend data.</p>;
  const lo = Math.floor((Math.min(...values) - 100) / 100) * 100;
  const hi = Math.ceil((Math.max(...values) + 100) / 100) * 100;
  // Labels keep the same size on screen, so on a phone they take up more of the viewBox:
  // the margins grow with them, or the y labels are cut off at the left edge.
  const ticks = [lo, (lo + hi) / 2, hi];
  const left = Math.max(76, Math.max(...ticks.map((v) => textWidth(money(v), px(13)))) + px(10));
  const inset = Math.max(40, textWidth(trend[0]!.quarter, px(12)) / 2 + px(4));
  const x = (i: number) => left + inset + (i * (RIGHT - left - 2 * inset)) / Math.max(1, trend.length - 1);
  const y = (v: number) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);
  const points = (run: Array<[number, number]>) => run.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const shown = trend.filter((_, i) => street[i] !== null);
  const last = trend.at(-1)!;
  const summary = shown.length
    ? `Line chart. The typical rent on ${streetLabel} moved from ${money(shown[0]!.streetMedian!)} in ${shown[0]!.quarter} to ${money(
        shown.at(-1)!.streetMedian!,
      )} in ${shown.at(-1)!.quarter}.${last.nationalMedian !== null ? ` The Singapore-wide typical rent was ${money(last.nationalMedian)} in ${last.quarter}.` : ''}`
    : 'Line chart. This street has too few rentals per quarter to plot.';
  const skipped = trend.length - shown.length;
  // Phones cannot fit 8 quarter labels side by side at a readable size: label every other one.
  const labelEvery = px(12) > 20 ? 2 : 1;

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={left} x2={RIGHT} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={left - px(10)} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={px(13)} className="fill-muted">
              {money(v)}
            </text>
          </g>
        ))}
        {trend.map((t, i) =>
          i % labelEvery === labelEvery - 1 ? (
            <text key={t.quarter} x={x(i)} y={BOTTOM + 14 + px(12)} textAnchor="middle" fontSize={px(12)} className="fill-muted">
              {t.quarter}
            </text>
          ) : null,
        )}
        {segments(national).map((run) => (
          <polyline key={`n${run[0]![0]}`} points={points(run)} fill="none" className="stroke-seq-2" strokeWidth="3" strokeDasharray="7 6" />
        ))}
        {segments(street).map((run) =>
          run.length === 1 ? (
            <circle key={`s${run[0]![0]}`} cx={x(run[0]![0])} cy={y(run[0]![1])} r="5" className="fill-plum" />
          ) : (
            <polyline
              key={`s${run[0]![0]}`}
              points={points(run)}
              fill="none"
              className="stroke-plum"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ),
        )}
      </svg>
      <ul className="flex flex-wrap gap-5 text-sm text-muted" aria-hidden="true">
        <li className="inline-flex items-center gap-2">
          <span className="h-1 w-5.5 rounded-sm bg-plum" />
          {streetLabel}
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="w-5.5 border-t-3 border-dashed border-seq-2" />
          All of Singapore
        </li>
      </ul>
      {skipped > 0 && (
        <p className="text-sm text-muted">
          Gaps are quarters with fewer than {MIN_QUARTER_RENTALS} rentals on this street, too few for a reliable figure.
        </p>
      )}
    </div>
  );
}
