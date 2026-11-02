import { FLAT_TYPE_LABELS, FLAT_TYPES, type FlatType } from '@rent-lens/shared';
import { label } from '../../ui.ts';

// 1-room flats have too few rentals to be useful, so there is no pill for them.
const CHOICES = FLAT_TYPES.filter((t) => t !== '1-ROOM');

/** Radio buttons styled as pills: the real input is invisible on top, so keyboard and screen readers work as usual. */
export function FlatTypePicker({ value, onChange }: { value: FlatType; onChange: (flatType: FlatType) => void }) {
  return (
    <fieldset>
      <legend className={label}>Flat type</legend>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((t) => (
          <label key={t} className="relative">
            <input
              type="radio"
              name="flatType"
              value={t}
              checked={t === value}
              onChange={() => onChange(t)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            <span className="inline-flex min-h-11 items-center rounded-full border-2 border-control bg-white px-4.5 peer-checked:border-plum peer-checked:bg-plum peer-checked:font-bold peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-plum">
              {FLAT_TYPE_LABELS[t]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
