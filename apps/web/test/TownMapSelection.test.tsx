import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TownMap } from '../src/components/TownMap.tsx';

const row = (town: string, share: number) => ({ town, rentals: 40, withinBudget: share * 40, share, lowData: false });
const towns = [row('KALLANG/WHAMPOA', 0.9), row('YISHUN', 0.4), row('BISHAN', 0.2)];

describe('TownMap selection', () => {
  it('draws the selected town on top of every other area, once per planning area', () => {
    // Kallang/Whampoa covers two planning areas (Kallang and Novena): two outline paths and two fill paths.
    const { container } = render(
      <TownMap towns={towns} budgetLabel="S$3,000" flatTypeLabel="4-room" selectedTown="KALLANG/WHAMPOA" onSelectTown={() => {}} />,
    );
    const svg = container.querySelector('svg')!;
    const overlay = svg.querySelector('g.pointer-events-none')!;
    expect(overlay.querySelectorAll('path.stroke-ink')).toHaveLength(2);
    expect(overlay.querySelectorAll('path:not(.stroke-ink)')).toHaveLength(2);
    // Later in the SVG means painted later: the overlay must come after all the base areas.
    const lastBaseArea = [...svg.children].filter((el) => el.tagName === 'path').at(-1)!;
    expect(lastBaseArea.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No base area carries the dark outline itself, so neighbours cannot paint over it.
    expect(svg.querySelectorAll(':scope > path.stroke-ink')).toHaveLength(0);
  });

  it('draws no outline when no town is selected', () => {
    const { container } = render(<TownMap towns={towns} budgetLabel="S$3,000" flatTypeLabel="4-room" onSelectTown={() => {}} />);
    expect(container.querySelectorAll('g.pointer-events-none path')).toHaveLength(0);
  });
});
