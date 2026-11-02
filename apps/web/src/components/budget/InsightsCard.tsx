import { FLAT_TYPE_LABELS, type SummaryResponse, toDisplayName } from '@rent-lens/shared';
import { clsx } from 'clsx';
import { money, monthLabel, signedPercent } from '../../format.ts';
import { card } from '../../ui.ts';

interface Props {
  summary: SummaryResponse;
  flatLabel: string;
}

/** Median rents in the latest 12 months against the 12 months before: per flat type, and the towns that moved most. */
export function InsightsCard({ summary, flatLabel }: Props) {
  const { window, previousWindow, flatTypes, towns } = summary;
  return (
    <section aria-labelledby="insights-heading" className={clsx(card, 'flex flex-col gap-5')}>
      <div className="flex flex-col gap-1">
        <h2 id="insights-heading" className="text-2xl">
          Rents compared with a year before
        </h2>
        <p className="text-sm text-muted">
          Median approved rent from {monthLabel(window.fromMonth)} to {monthLabel(window.toMonth)}, against {monthLabel(previousWindow.fromMonth)} to{' '}
          {monthLabel(previousWindow.toMonth)}. Only groups with at least 10 rentals in both periods are shown.
        </p>
      </div>
      <div className="grid gap-7 md:grid-cols-2">
        <table className="text-sm">
          <caption className="mb-2 text-left text-base font-bold">By flat type</caption>
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Flat type
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Now
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                A year before
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {flatTypes.map((row) => (
              <tr key={row.flatType} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {FLAT_TYPE_LABELS[row.flatType]}
                </th>
                <td className="py-2 pr-3 text-right tabular-nums">{money(row.median)}</td>
                <td className="py-2 pr-3 text-right text-muted tabular-nums">{money(row.previousMedian)}</td>
                <td className="py-2 text-right font-bold tabular-nums">{signedPercent(row.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col gap-2">
          <h3 className="font-sans text-base font-bold">Biggest changes for {flatLabel}</h3>
          {towns.length === 0 ? (
            <p className="text-sm text-muted">Not enough {flatLabel} rentals in both periods to compare towns.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {towns.map((t) => (
                <li key={t.town} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <span className="font-medium">{toDisplayName(t.town)}</span>
                  <span className="text-muted tabular-nums">
                    {money(t.previousMedian)} to {money(t.median)} <strong className="text-ink">{signedPercent(t.change)}</strong>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
