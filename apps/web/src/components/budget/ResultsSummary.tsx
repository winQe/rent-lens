import { FIT_SHARE, type StreetsResponse, toDisplayName } from '@rent-lens/shared';
import { money, monthLabel, percent } from '../../format.ts';

interface Props {
  result: StreetsResponse | undefined;
  error: Error | null;
  busy: boolean;
  flatLabel: string;
  budget: number;
  town: string | undefined;
}

/** The headline count. A live region, so screen readers hear the new count after each search. */
export function ResultsSummary({ result, error, busy, flatLabel, budget, town }: Props) {
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite" aria-busy={busy}>
      {error ? (
        <p className="font-bold text-error" role="alert">
          Could not load results: {error.message}
        </p>
      ) : result ? (
        <>
          <h2 className="text-4xl">
            {result.fitCount === 0
              ? `No streets where most ${flatLabel} rents are within ${money(budget)}`
              : `${result.fitCount} ${result.fitCount === 1 ? 'street fits' : 'streets fit'} your budget`}
          </h2>
          <p className="text-muted">
            Streets where at least {percent(FIT_SHARE)} of {flatLabel} rents were {money(budget)} or less
            {town ? ` in ${toDisplayName(town)}` : ''}. Based on rentals approved from {monthLabel(result.window.fromMonth)} to{' '}
            {monthLabel(result.window.toMonth)}.
          </p>
        </>
      ) : (
        <p className="text-muted">Loading results…</p>
      )}
    </div>
  );
}
