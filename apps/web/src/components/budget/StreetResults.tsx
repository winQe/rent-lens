import { MIN_RENTALS, type StreetBudgetRow } from '@rent-lens/shared';
import { clsx } from 'clsx';
import { button } from '../../ui.ts';
import { StreetCard } from '../StreetCard.tsx';

interface Props {
  items: StreetBudgetRow[];
  total: number;
  lowDataCount: number;
  /** The results page's query string, carried into each street link for the way back. */
  linkSearch: string;
  includeLowData: boolean;
  onIncludeLowData: (include: boolean) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onShowMore: () => void;
}

export function StreetResults({ items, total, lowDataCount, linkSearch, includeLowData, onIncludeLowData, hasMore, loadingMore, onShowMore }: Props) {
  return (
    <section aria-labelledby="streets-heading" className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="streets-heading" className="text-3xl">
          Streets that fit best
        </h2>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={includeLowData} onChange={(e) => onIncludeLowData(e.target.checked)} className="size-5 accent-plum" />
          Include {lowDataCount} streets with under {MIN_RENTALS} rentals
        </label>
      </div>
      {items.length === 0 ? (
        <p className="text-muted">No streets match. Try a higher budget or another town.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((row) => (
            <StreetCard key={`${row.town}|${row.street}`} row={row} search={linkSearch} />
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" className={clsx(button, 'self-center')} disabled={loadingMore} onClick={onShowMore}>
          {loadingMore ? 'Loading…' : `Show more (${items.length} of ${total})`}
        </button>
      )}
    </section>
  );
}
