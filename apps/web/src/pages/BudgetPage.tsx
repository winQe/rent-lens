import { FLAT_TYPE_LABELS } from '@rent-lens/shared';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { api } from '../api.ts';
import { BudgetSlider } from '../components/budget/BudgetSlider.tsx';
import { FlatTypePicker } from '../components/budget/FlatTypePicker.tsx';
import { InsightsCard } from '../components/budget/InsightsCard.tsx';
import { ResultsSummary } from '../components/budget/ResultsSummary.tsx';
import { StreetResults } from '../components/budget/StreetResults.tsx';
import { TownMapCard } from '../components/budget/TownMapCard.tsx';
import { TownSelect } from '../components/budget/TownSelect.tsx';
import { card } from '../ui.ts';
import { useBudgetSearch } from '../useBudgetSearch.ts';

const PAGE_SIZE = 12;

/** Holds the search state and the two queries; the components below only render what they are given. */
export function BudgetPage() {
  const { budget, flatType, town, includeLowData, update } = useBudgetSearch();
  // The label follows the slider at once; requests wait until it stops for 250 ms.
  const [queryBudget] = useDebounce(budget, 250);
  const flatLabel = FLAT_TYPE_LABELS[flatType];

  const towns = useQuery({
    queryKey: ['towns', flatType, queryBudget],
    queryFn: ({ signal }) => api.towns(flatType, queryBudget, signal),
    placeholderData: keepPreviousData,
  });

  const streets = useInfiniteQuery({
    queryKey: ['streets', flatType, queryBudget, town, includeLowData],
    queryFn: ({ pageParam, signal }) =>
      api.streets({ flatType, budget: queryBudget, town, includeLowData, page: pageParam, pageSize: PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });

  // Year-on-year medians change only with the monthly load, and do not depend on the budget.
  const summary = useQuery({
    queryKey: ['summary', flatType],
    queryFn: ({ signal }) => api.summary(flatType, signal),
    placeholderData: keepPreviousData,
  });

  const first = streets.data?.pages[0];
  const selectTown = (name: string) => update({ town: name === town ? undefined : name });

  // A town with no rentals of the chosen flat type (or a hand-edited URL) is not in the list:
  // clear it, so the select and the results never disagree.
  const knownTowns = towns.data && !towns.isPlaceholderData ? towns.data.towns : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: update is a new function on every render; adding it would rerun the effect every render.
  useEffect(() => {
    if (town && knownTowns && !knownTowns.some((t) => t.town === town)) update({ town: undefined });
  }, [town, knownTowns]);

  // Street links carry the whole search, so 'Back to results' restores it.
  const linkSearch = new URLSearchParams({
    flatType,
    budget: String(queryBudget),
    ...(town ? { town } : {}),
    ...(includeLowData ? { all: '1' } : {}),
  }).toString();

  return (
    <>
      <section aria-labelledby="search-heading" className={clsx(card, 'grid items-center gap-8 md:grid-cols-2')}>
        <div className="flex flex-col gap-3">
          <h1 id="search-heading" className="text-hero">
            What can you pay each month?
          </h1>
          <BudgetSlider value={budget} onChange={(value) => update({ budget: String(value) })} />
        </div>
        <div className="flex flex-col gap-5">
          <FlatTypePicker value={flatType} onChange={(value) => update({ flatType: value })} />
          <TownSelect towns={towns.data?.towns ?? []} value={town} onChange={(value) => update({ town: value })} />
        </div>
      </section>

      <ResultsSummary result={first} error={streets.error} busy={streets.isFetching} flatLabel={flatLabel} budget={queryBudget} town={town} />

      {towns.isError && !towns.data && (
        <p className="font-bold text-error" role="alert">
          Could not load the town map: {towns.error.message}
        </p>
      )}
      {towns.data && (
        <TownMapCard towns={towns.data.towns} budget={queryBudget} flatLabel={flatLabel} selectedTown={town} onSelectTown={selectTown} />
      )}

      {first && (
        <StreetResults
          items={streets.data?.pages.flatMap((p) => p.items) ?? []}
          total={first.total}
          lowDataCount={first.lowDataCount}
          linkSearch={linkSearch}
          includeLowData={includeLowData}
          onIncludeLowData={(include) => update({ all: include ? '1' : undefined })}
          hasMore={streets.hasNextPage}
          loadingMore={streets.isFetchingNextPage}
          onShowMore={() => streets.fetchNextPage()}
        />
      )}

      {summary.data && <InsightsCard summary={summary.data} flatLabel={flatLabel} />}
      {summary.isError && !summary.data && (
        <p className="text-sm text-muted">Could not load the comparison with a year before: {summary.error.message}</p>
      )}

      <p className="max-w-prose rounded-2xl bg-note px-5 py-4 text-note-ink">
        Heads up: flat owners declare these rents themselves and HDB does not check them. Lots of owners pick round numbers like S$3,000, so think of
        these as a guide.
      </p>
    </>
  );
}
