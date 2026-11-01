import { type FlatType, normalizeFlatType } from '@rent-lens/shared';
import { useSearchParams } from 'react-router';
import { SLIDER } from './components/budget/BudgetSlider.tsx';

/** All search state lives in the URL, so results can be bookmarked, shared and reached with Back. */
export function useBudgetSearch() {
  const [params, setParams] = useSearchParams();
  // A hand-edited or shared URL may hold any number: snap it to the slider, so the label,
  // the slider thumb and the API request always agree (the API takes whole dollars only).
  // An empty value (`?budget=`) counts as missing: Number('') is 0, which would snap to the minimum.
  const rawBudget = Number(params.get('budget') || NaN);
  const budget = Number.isFinite(rawBudget)
    ? Math.min(SLIDER.max, Math.max(SLIDER.min, Math.round(rawBudget / SLIDER.step) * SLIDER.step))
    : SLIDER.default;
  const flatType: FlatType = normalizeFlatType(params.get('flatType') ?? '') ?? '4-ROOM';
  const town = params.get('town') ?? undefined;
  const includeLowData = params.get('all') === '1';

  const update = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  return { budget, flatType, town, includeLowData, update };
}
