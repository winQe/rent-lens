import { useResizeObserver } from 'use-resize-observer';

/**
 * SVG text is sized in viewBox units, so a 900-wide chart drawn 300 px wide on a phone shrinks
 * 13 px text to about 4 px. `px(n)` returns the viewBox size that renders at n screen pixels.
 * Attach `ref` to the HTML element that wraps the <svg> and has the same width.
 */
export function useSvgScale(viewBoxWidth: number) {
  const { ref, width } = useResizeObserver<HTMLDivElement>();
  const scale = width ? width / viewBoxWidth : 1;
  return { ref, px: (screenPx: number) => screenPx / scale };
}
