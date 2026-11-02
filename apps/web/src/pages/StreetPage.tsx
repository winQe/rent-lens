import { FLAT_TYPE_LABELS, MIN_RENTALS, normalizeFlatType, toDisplayName, WINDOW_MONTHS } from '@rent-lens/shared';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Link, useParams, useSearchParams } from 'react-router';
import { api, RequestError } from '../api.ts';
import { RentCheck } from '../components/RentCheck.tsx';
import { TrendChart } from '../components/TrendChart.tsx';
import { money, monthLabel } from '../format.ts';
import { card, link, tag } from '../ui.ts';

export function StreetPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const town = (params.town ?? '').toUpperCase();
  const street = (params.street ?? '').toUpperCase();
  const flatType = normalizeFlatType(search.get('flatType') ?? '') ?? '4-ROOM';
  // Rebuild the results query from known keys only, URL-encoded, so 'Back' restores the same search.
  const back = new URLSearchParams();
  for (const key of ['flatType', 'budget', 'town', 'all']) {
    const value = search.get(key);
    if (value) back.set(key, value);
  }
  const backTo = `/?${back}`;

  const detail = useQuery({
    queryKey: ['street', flatType, town, street],
    queryFn: ({ signal }) => api.streetDetail(flatType, town, street, signal),
  });

  const streetLabel = toDisplayName(street);
  const backLink = (
    <Link to={backTo} className={clsx(link, 'inline-flex min-h-11 items-center gap-1.5 self-start no-underline')}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back to results
    </Link>
  );

  if (detail.isPending)
    return (
      <>
        {backLink}
        <p className="text-muted">Loading {streetLabel}…</p>
      </>
    );
  if (detail.isError) {
    const notFound = detail.error instanceof RequestError && detail.error.status === 404;
    return (
      <>
        {backLink}
        <h1 className="text-4xl">{notFound ? `No recent ${FLAT_TYPE_LABELS[flatType]} rentals on ${streetLabel}` : 'Something went wrong'}</h1>
        <p className="text-muted">{notFound ? 'Try another flat type or go back to the results.' : detail.error.message}</p>
      </>
    );
  }

  const d = detail.data;
  const tiles = [
    { label: 'Most rents', value: `${money(d.p25)} to ${money(d.p75)}`, note: 'The middle half of rentals' },
    {
      label: 'Typical rent',
      value: money(d.median),
      note: d.median === d.townMedian ? `Same as ${toDisplayName(town)} overall` : `${toDisplayName(town)} overall: ${money(d.townMedian)}`,
    },
    { label: 'Rentals', value: String(d.rentals), note: `Across ${d.blocks} ${d.blocks === 1 ? 'block' : 'blocks'}` },
  ];

  return (
    <>
      {backLink}
      <section className="flex flex-col gap-2">
        <span className={tag}>{toDisplayName(town)}</span>
        <h1 className="text-hero">{streetLabel}</h1>
        <p className="text-muted">
          {FLAT_TYPE_LABELS[flatType]} flats · rentals approved from {monthLabel(d.window.fromMonth)} to {monthLabel(d.window.toMonth)}
        </p>
      </section>

      {d.lowData && (
        <p className="rounded-2xl bg-warn px-5 py-4 text-warn-ink">
          Only {d.rentals} rentals on this street in the last {WINDOW_MONTHS} months, so these figures can swing a lot. The rent check compares with
          the whole town.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1.5 rounded-3xl border border-line bg-white p-5.5">
            <span className="text-base font-bold">{t.label}</span>
            <span className="font-display text-3xl font-extrabold">{t.value}</span>
            <span className="text-sm text-muted">{t.note}</span>
          </div>
        ))}
      </div>

      <RentCheck flatType={flatType} town={town} street={street} histogram={d.histogram} />

      <section aria-labelledby="trend-heading" className={clsx(card, 'flex flex-col gap-3.5')}>
        <div className="flex flex-col gap-1.5">
          <h2 id="trend-heading" className="text-3xl">
            Typical rent by quarter
          </h2>
          <p className="text-muted">We use quarters because one street has too few rentals each month for a stable figure.</p>
        </div>
        <TrendChart trend={d.trend} streetLabel={streetLabel} />
      </section>

      <p className="max-w-prose rounded-2xl bg-note px-5 py-4 text-note-ink">
        Why not by block? Most blocks have only 1 or 2 rentals a year, which is too few to compare. When a street has fewer than {MIN_RENTALS}{' '}
        rentals, the rent check uses the whole town and says so.
      </p>
    </>
  );
}
