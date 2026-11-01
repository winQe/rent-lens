import { TOWN_PLANNING_AREAS, type TownBudgetRow, toDisplayName } from '@rent-lens/shared';
import { clsx } from 'clsx';
import { useMemo } from 'react';
import map from '../data/planning-areas.json';
import { percent, shareStep, topTowns } from '../format.ts';
import { useSvgScale } from '../useSvgScale.ts';

const STEP_FILL = ['fill-map-0', 'fill-map-1', 'fill-map-2', 'fill-map-3', 'fill-map-4'];
/** Label colour for each fill above: ink on the light steps, white on the dark ones (all at least 4.5:1). */
const STEP_TEXT = ['fill-ink', 'fill-ink', 'fill-white', 'fill-white', 'fill-white'];
/** The fill colours as strokes, to close the hairline seam between two filled areas of one town. */
const STEP_STROKE = ['stroke-map-0', 'stroke-map-1', 'stroke-map-2', 'stroke-map-3', 'stroke-map-4'];
/** Planning areas that hold HDB flats, from the town mapping. Others are drawn as "No HDB flats". */
const HDB_AREAS = new Set(Object.values(TOWN_PLANNING_AREAS).flat());
const HATCH = 'url(#few-rentals)';

/**
 * Largest font size (map units) at which `text` fits inside a circle of radius `room` around the
 * label point, or undefined if even the smallest size would cross the area's border. Bold digits
 * are about 0.6em wide and "%" about 0.85em; the text box is about 0.75em tall. `unit` is the
 * map units per screen pixel, so labels stay 11 to 13 px on screen at any map width.
 */
export function labelSize(text: string, room: number, unit = 1): number | undefined {
  return [13 * unit, 11 * unit].find((size) => {
    const width = size * (0.6 * (text.length - 1) + 0.85);
    return Math.hypot(width / 2, (size * 0.75) / 2) <= room;
  });
}

interface Props {
  towns: TownBudgetRow[];
  budgetLabel: string;
  flatTypeLabel: string;
  selectedTown?: string;
  onSelectTown: (town: string) => void;
}

/**
 * Choropleth of URA planning areas, coloured by the share of rents within budget in the
 * HDB town that covers each area. The map is a visual summary only: every number on it is
 * also in the "Top towns" list, which is the keyboard and screen-reader path.
 */
export function TownMap({ towns, budgetLabel, flatTypeLabel, selectedTown, onSelectTown }: Props) {
  const { ref, px } = useSvgScale(map.width);
  const byArea = useMemo(() => {
    const result = new Map<string, TownBudgetRow>();
    for (const town of towns) {
      for (const area of TOWN_PLANNING_AREAS[town.town] ?? []) result.set(area, town);
    }
    return result;
  }, [towns]);

  const top = useMemo(() => topTowns(towns), [towns]);
  const selectedAreas = map.areas.filter((area) => selectedTown !== undefined && byArea.get(area.name)?.town === selectedTown);

  /** Fill for one planning area: a share colour, the "few rentals" hatch, or grey for no HDB flats. */
  const areaFill = (name: string): { fillClass: string; strokeClass: string; fill?: string } => {
    const town = byArea.get(name);
    if (!HDB_AREAS.has(name)) return { fillClass: 'fill-map-empty', strokeClass: 'stroke-map-empty' };
    // A known HDB town missing from the response has no rentals of this flat type.
    if (!town || town.lowData) return { fillClass: '', strokeClass: '', fill: HATCH };
    const step = shareStep(town.share);
    return { fillClass: STEP_FILL[step]!, strokeClass: STEP_STROKE[step]! };
  };
  const description = `Towns with the most rents at or below ${budgetLabel}: ${top.map((t) => `${toDisplayName(t.town)} ${percent(t.share)}`).join(', ')}.`;

  const legend = [
    { swatch: 'bg-map-4', text: '75% or more fit' },
    { swatch: 'bg-map-3', text: '50 to 74%' },
    { swatch: 'bg-map-2', text: '25 to 49%' },
    { swatch: 'bg-map-1', text: '10 to 24%' },
    { swatch: 'bg-map-0', text: 'Under 10%' },
    { swatch: 'bg-hatch border border-control', text: `Few or no ${flatTypeLabel} rentals` },
    { swatch: 'bg-map-empty', text: 'No HDB flats: nature reserves, airport, industry' },
  ];

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div ref={ref}>
        <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={`Map of Singapore. ${description}`} className="block h-auto w-full">
          <defs>
            {/* Texture, not just a colour, so "few rentals" stands apart from the lightest shade and from white. */}
            <pattern id="few-rentals" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" className="fill-white" />
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-control" strokeWidth="2" />
            </pattern>
          </defs>
          {map.areas.map((area) => {
            const town = byArea.get(area.name);
            const hdb = HDB_AREAS.has(area.name);
            const { fillClass, fill } = areaFill(area.name);
            const title = town
              ? `${toDisplayName(town.town)}: ${percent(town.share)} of ${town.rentals} ${flatTypeLabel} rentals fit`
              : hdb
                ? `${toDisplayName(area.name)}: no ${flatTypeLabel} rentals`
                : `${toDisplayName(area.name)}: no HDB flats`;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: a mouse shortcut only; the town select and the Top towns buttons are the keyboard path.
              <path
                key={area.name}
                d={area.d}
                fill={fill}
                className={clsx(fillClass, 'stroke-white stroke-[1.2]', town && 'cursor-pointer hover:opacity-85')}
                strokeLinejoin="round"
                onClick={town ? () => onSelectTown(town.town) : undefined}
              >
                <title>{title}</title>
              </path>
            );
          })}
          {/* The selected town is drawn again on top, so later neighbours cannot paint over its outline:
            a wide stroke first, then the same areas filled with no stroke. The fill covers the inner
            half of the stroke and the border between two areas of one town (Kallang/Whampoa), so only
            the town's outer edge stays dark. */}
          <g className="pointer-events-none">
            {selectedAreas.map((area) => (
              <path key={area.name} d={area.d} fill="none" className="stroke-ink" strokeWidth={px(6)} strokeLinejoin="round" />
            ))}
            {selectedAreas.map((area) => {
              const { fillClass, strokeClass, fill } = areaFill(area.name);
              return <path key={area.name} d={area.d} fill={fill} stroke={fill} strokeWidth={px(1.5)} className={clsx(fillClass, strokeClass)} />;
            })}
          </g>
          {top.map((t) => {
            const area = map.areas.find((a) => a.name === TOWN_PLANNING_AREAS[t.town]?.[0]);
            const label = percent(t.share);
            const size = area && labelSize(label, area.r, px(1));
            // Too narrow for a readable label: the value is still in the Top towns list and the tooltip.
            return area && size ? (
              <text
                key={t.town}
                x={area.x}
                y={area.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size}
                className={clsx('pointer-events-none font-bold', STEP_TEXT[shareStep(t.share)])}
              >
                {label}
              </text>
            ) : null;
          })}
        </svg>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-sm text-muted" aria-hidden="true">
        {legend.map((item) => (
          <li key={item.text} className="inline-flex items-center gap-1.5">
            <span className={clsx('inline-block size-3.5 rounded', item.swatch)} />
            {item.text}
          </li>
        ))}
      </ul>
      <figcaption className="text-sm text-muted">
        Boundaries: URA Master Plan 2025 planning areas (data.gov.sg). Kallang/Whampoa covers Kallang and Novena; Central covers Outram and Rochor.
      </figcaption>
    </figure>
  );
}
