import { BUDGET_MAX, BUDGET_MIN, type FlatType, type HistogramBin, type RentVerdict } from '@rent-lens/shared';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { type FormEvent, useState } from 'react';
import { api } from '../api.ts';
import { money, percent } from '../format.ts';
import { button, card } from '../ui.ts';

const VERDICT: Record<RentVerdict, { label: string; className: string }> = {
  below: { label: 'Below most rents', className: 'bg-good text-good-ink' },
  usual: { label: 'In the usual range', className: 'bg-soft text-soft-ink' },
  above: { label: 'Above most rents', className: 'bg-bad text-bad-ink' },
};

interface Props {
  flatType: FlatType;
  town: string;
  street: string;
  histogram: HistogramBin[];
}

export function RentCheck({ flatType, town, street, histogram }: Props) {
  const [input, setInput] = useState('');
  const [rent, setRent] = useState<number | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const check = useQuery({
    queryKey: ['rent-check', flatType, town, street, rent],
    queryFn: ({ signal }) => api.rentCheck(flatType, town, street, rent!, signal),
    enabled: rent !== null,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(input.replace(/[,\s]/g, ''));
    if (!input.trim() || !Number.isInteger(value) || value < BUDGET_MIN || value > BUDGET_MAX) {
      setInputError(`Enter a whole-dollar rent between ${money(BUDGET_MIN)} and ${money(BUDGET_MAX)}.`);
      setRent(null);
      return;
    }
    setInputError(null);
    setRent(value);
  };

  const max = Math.max(1, ...histogram.map((b) => b.count));
  const result = check.data;
  const hitBin = result?.comparedWith === 'street' ? histogram.find((b) => result.rent >= b.from && result.rent < b.to) : undefined;
  // A street can have 15 or more S$200 bins: label a few of them on phones, more on wider screens.
  const phoneStride = Math.ceil(histogram.length / 5);
  const wideStride = Math.ceil(histogram.length / 10);

  return (
    <section aria-labelledby="check-heading" className={clsx(card, 'flex flex-col gap-5.5')}>
      <div className="flex flex-col gap-1.5">
        <h2 id="check-heading" className="text-3xl">
          Is this rent fair?
        </h2>
        <p className="text-muted">Type the rent from a listing. We compare it with approved rents for the same flat type on this street.</p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rent" className="font-bold">
            Monthly rent
          </label>
          <div className="flex min-h-15 items-center gap-2 rounded-2xl border-2 border-control bg-white px-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-plum">
            <span aria-hidden="true" className="text-xl text-muted">
              S$
            </span>
            <input
              id="rent"
              inputMode="numeric"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={inputError !== null}
              aria-describedby={inputError ? 'rent-error' : undefined}
              className="w-32 border-0 bg-transparent font-display text-3xl font-extrabold outline-none focus-visible:outline-none"
            />
          </div>
        </div>
        <button type="submit" className={button}>
          Check rent
        </button>
      </form>

      <div aria-live="polite">
        {inputError && (
          <p id="rent-error" className="font-bold text-error">
            {inputError}
          </p>
        )}
        {check.isError && <p className="font-bold text-error">Could not check this rent: {check.error.message}</p>}
        {result && (
          <div className={clsx('flex flex-col gap-1.5 rounded-2xl px-5 py-4.5', VERDICT[result.verdict].className)}>
            <span className="text-sm font-bold tracking-wide uppercase">{VERDICT[result.verdict].label}</span>
            <p className="text-xl font-bold">
              {money(result.rent)} is more than {percent(result.shareLower)} of recent rents{' '}
              {result.comparedWith === 'street' ? 'on this street' : 'in this town'}.
            </p>
            <p>
              {result.lower} of {result.rentals} rentals were lower{result.equal > 0 ? ` and ${result.equal} were exactly ${money(result.rent)}` : ''}
              . Most rents ran from {money(result.p25)} to {money(result.p75)}.
              {result.comparedWith === 'town' && ' This street has too few rentals to compare on its own, so we used the whole town.'}
            </p>
            {result.lowData && (
              <p className="font-bold">The town also has only {result.rentals} rentals of this type, so treat this as a rough guide.</p>
            )}
          </div>
        )}
      </div>

      <figure className="m-0 flex flex-col gap-2.5">
        <figcaption className="flex flex-col gap-0.5">
          <span className="font-bold">How rents on this street are spread out</span>
          {hitBin && (
            <span className="text-sm">
              Your rent is in the outlined bar: {money(hitBin.from)} to {money(hitBin.to - 1)}, with {hitBin.count} rentals.
            </span>
          )}
        </figcaption>
        <div className="flex h-42.5 items-end gap-1.5" role="img" aria-label={histogramLabel(histogram)}>
          {histogram.map((bin) => {
            const hit = bin === hitBin;
            return (
              <div key={bin.from} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                {/* The rent's bar is marked by an outline and bold count as well as colour (WCAG 1.4.1), and named in the caption. */}
                <span className={clsx('text-xs sm:text-sm', hit ? 'font-bold text-ink' : 'text-muted')}>{bin.count}</span>
                <div
                  className={clsx('min-h-1 w-full rounded-t-lg rounded-b-sm', hit ? 'bg-plum ring-2 ring-ink ring-offset-2' : 'bg-seq-2')}
                  style={{ height: `${(bin.count / max) * 130}px` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1.5 text-xs text-muted" aria-hidden="true">
          {histogram.map((bin, i) => (
            <span
              key={bin.from}
              className={clsx(
                'min-w-0 flex-1 text-center whitespace-nowrap',
                i % phoneStride !== 0 && (i % wideStride === 0 ? 'invisible sm:visible' : 'invisible'),
              )}
            >
              {(bin.from / 1000).toFixed(1)}k
            </span>
          ))}
        </div>
      </figure>
    </section>
  );
}

function histogramLabel(bins: HistogramBin[]): string {
  if (bins.length === 0) return 'No rents to show.';
  const peak = bins.reduce((a, b) => (b.count > a.count ? b : a));
  return `Bar chart of approved rents from ${money(bins[0]!.from)} to ${money(bins.at(-1)!.to)}. The largest group is ${money(peak.from)} to ${money(
    peak.to - 1,
  )}, with ${peak.count} rentals.`;
}
