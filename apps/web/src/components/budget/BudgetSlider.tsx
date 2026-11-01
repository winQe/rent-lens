import { money } from '../../format.ts';

export const SLIDER = { min: 1000, max: 6000, step: 100, default: 3000 };

export function BudgetSlider({ value, onChange }: { value: number; onChange: (budget: number) => void }) {
  return (
    <>
      {/* The output sits outside the label, so the slider's name stays "Monthly budget" and the value is read once, from aria-valuetext. */}
      <div className="flex flex-col">
        <label htmlFor="budget" className="font-bold">
          Monthly budget
        </label>
        <output htmlFor="budget" className="font-display text-amount font-extrabold text-plum tabular-nums">
          {money(value)}
        </output>
      </div>
      <input
        id="budget"
        type="range"
        min={SLIDER.min}
        max={SLIDER.max}
        step={SLIDER.step}
        value={value}
        aria-valuetext={money(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full accent-plum"
      />
      <div className="flex justify-between text-sm text-muted" aria-hidden="true">
        <span>{money(SLIDER.min)}</span>
        <span>{money(SLIDER.max)}</span>
      </div>
    </>
  );
}
