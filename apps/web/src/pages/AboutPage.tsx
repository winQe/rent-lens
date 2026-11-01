import { DATASET_ID, FIT_SHARE, MIN_RENTALS, WINDOW_MONTHS } from '@rent-lens/shared';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { api } from '../api.ts';
import { monthLabel, percent } from '../format.ts';
import { card, link } from '../ui.ts';

export function AboutPage() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta(signal) });

  return (
    <article className={clsx(card, 'flex max-w-3xl flex-col gap-4 leading-relaxed')}>
      <h1 className="text-4xl">About the data</h1>
      <p>
        RentLens uses the Housing &amp; Development Board dataset{' '}
        <a className={link} href={`https://data.gov.sg/datasets/${DATASET_ID}/view`}>
          Renting Out of Flats from Jan 2021
        </a>{' '}
        on data.gov.sg. Each row is one approval to rent out a whole HDB flat, with the month, town, block, street, flat type and monthly rent.
      </p>
      {meta.data && (
        <p className="text-muted">
          Loaded {meta.data.rowCount.toLocaleString('en-SG')} approvals. Figures cover {monthLabel(meta.data.window.fromMonth)} to{' '}
          {monthLabel(meta.data.window.toMonth)}.
        </p>
      )}
      <h2 className="mt-2 text-2xl">How to read the numbers</h2>
      <ul className="flex list-disc flex-col gap-2 pl-6">
        <li>Rents are declared by flat owners. HDB does not check them, and many owners declare round numbers such as S$3,000.</li>
        <li>All figures use the latest {WINDOW_MONTHS} months in the dataset, so a street's numbers reflect today's market, not 2021.</li>
        <li>
          A street "fits" your budget when at least {percent(FIT_SHARE)} of its rents were at or below it. We use this share, not the median, because
          round numbers make many medians exactly equal.
        </li>
        <li>
          Streets with fewer than {MIN_RENTALS} rentals are hidden by default, and there are no figures for single blocks: most blocks have only 1 or
          2 rentals a year.
        </li>
        <li>The map colours URA planning areas by the HDB town that covers them. HDB towns and planning areas do not match exactly.</li>
      </ul>
    </article>
  );
}
