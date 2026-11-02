import { type TownBudgetRow, toDisplayName } from '@rent-lens/shared';
import { label } from '../../ui.ts';

interface Props {
  towns: TownBudgetRow[];
  value: string | undefined;
  onChange: (town: string | undefined) => void;
}

export function TownSelect({ towns, value, onChange }: Props) {
  return (
    <div>
      <label htmlFor="town" className={label}>
        Town
      </label>
      <select
        id="town"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="min-h-12 w-full rounded-2xl border-2 border-control bg-white px-3.5"
      >
        <option value="">Any town</option>
        {towns.map((t) => (
          <option key={t.town} value={t.town}>
            {toDisplayName(t.town)}
          </option>
        ))}
      </select>
    </div>
  );
}
