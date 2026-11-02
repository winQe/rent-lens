import { type TownBudgetRow, toDisplayName } from '@rent-lens/shared';
import { clsx } from 'clsx';
import { money, percent, shareStep, topTowns } from '../../format.ts';
import { card } from '../../ui.ts';
import { TownMap } from '../TownMap.tsx';

interface Props {
  towns: TownBudgetRow[];
  budget: number;
  flatLabel: string;
  selectedTown: string | undefined;
  onSelectTown: (town: string) => void;
}

/** The map and the "Top towns" list. The list is the keyboard and screen-reader path to the same numbers. */
export function TownMapCard({ towns, budget, flatLabel, selectedTown, onSelectTown }: Props) {
  // When every town lands in the same end step, the map is one colour: say why and what to do.
  const steps = towns.filter((t) => !t.lowData).map((t) => shareStep(t.share));
  const allHigh = steps.length > 0 && steps.every((s) => s === 4);
  const allLow = steps.length > 0 && steps.every((s) => s === 0);
  return (
    <section aria-labelledby="map-heading" className={clsx(card, 'grid gap-7 lg:grid-cols-4')}>
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-3">
        <div className="flex flex-col gap-1">
          <h2 id="map-heading" className="text-2xl">
            Where your budget goes furthest
          </h2>
          <p className="text-sm text-muted">
            Share of {flatLabel} rents at or below {money(budget)} in each HDB town. Darker means more rents fit.
          </p>
        </div>
        {(allHigh || allLow) && (
          <p className="self-start rounded-2xl bg-note px-4 py-2.5 text-sm text-note-ink">
            {allHigh
              ? `At least 75% of ${flatLabel} rents fit ${money(budget)} in every town. Lower the budget to compare towns.`
              : `Under 10% of ${flatLabel} rents fit ${money(budget)} in every town. Raise the budget to compare towns.`}
          </p>
        )}
        <TownMap towns={towns} budgetLabel={money(budget)} flatTypeLabel={flatLabel} selectedTown={selectedTown} onSelectTown={onSelectTown} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="font-sans text-lg font-bold">Top towns</h3>
        <ol className="flex flex-col gap-2">
          {topTowns(towns).map((t) => (
            <li key={t.town}>
              <button
                type="button"
                aria-pressed={t.town === selectedTown}
                onClick={() => onSelectTown(t.town)}
                className="flex min-h-13 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-control bg-white px-4 text-left aria-pressed:border-plum aria-pressed:bg-soft"
              >
                <span className="font-bold">{toDisplayName(t.town)}</span>
                <span className="text-sm text-muted">
                  <strong className="text-lg text-plum">{percent(t.share)}</strong> fit
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Pick a town, or click it on the map, to see only its streets.</p>
      </div>
    </section>
  );
}
