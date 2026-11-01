import { type StreetBudgetRow, toDisplayName } from '@rent-lens/shared';
import { Link } from 'react-router';
import { inTen, inTenLabel, money, percent } from '../format.ts';
import { tag } from '../ui.ts';
import { Dots } from './Dots.tsx';

/** `search` is the results page's query string (flat type, budget, filters), kept for the way back. */
function streetPath(town: string, street: string, search: string) {
  return `/streets/${encodeURIComponent(town)}/${encodeURIComponent(street)}?${search}`;
}

export function StreetCard({ row, search }: { row: StreetBudgetRow; search: string }) {
  return (
    <li>
      <Link
        to={streetPath(row.town, row.street, search)}
        className="flex h-full flex-col gap-3.5 rounded-3xl border border-line bg-white p-5 text-ink hover:border-seq-1"
      >
        <div className="flex items-center justify-between gap-2">
          <span className={tag}>{toDisplayName(row.town)}</span>
          <span className="text-sm text-muted">{row.rentals} rentals</span>
        </div>
        <span className="font-display text-2xl leading-tight font-extrabold">{toDisplayName(row.street)}</span>
        <Dots filled={inTen(row.share)} />
        <span>
          <strong className="text-xl">{inTenLabel(row.share)}</strong> rentals here fit your budget
          <span className="sr-only"> ({percent(row.share)})</span>
        </span>
        <span className="text-sm text-muted">
          Most rents: {money(row.p25)} to {money(row.p75)}
        </span>
        {row.lowData && (
          <span className="self-start rounded-full bg-warn px-2.5 py-1 text-sm font-bold text-warn-ink">Few rentals, treat with care</span>
        )}
      </Link>
    </li>
  );
}
