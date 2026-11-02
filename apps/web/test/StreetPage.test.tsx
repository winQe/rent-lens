import type { StreetDetailResponse } from '@rent-lens/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, RequestError } from '../src/api.ts';
import { StreetPage } from '../src/pages/StreetPage.tsx';
import { axeViolations, renderAt } from './render.tsx';

const detail: StreetDetailResponse = {
  flatType: '4-ROOM',
  town: 'YISHUN',
  street: 'YISHUN RING RD',
  window: { fromMonth: '2025-10', toMonth: '2026-09' },
  rentals: 138,
  blocks: 75,
  p25: 2963,
  median: 3100,
  p75: 3300,
  townMedian: 3100,
  lowData: false,
  histogram: [
    { from: 2800, to: 3000, count: 15 },
    { from: 3000, to: 3200, count: 46 },
  ],
  trend: [
    { quarter: '2026 Q2', streetMedian: 3000, streetRentals: 40, nationalMedian: 3400 },
    { quarter: '2026 Q3', streetMedian: 3025, streetRentals: 26, nationalMedian: 3400 },
  ],
};

const PATH = '/streets/YISHUN/YISHUN%20RING%20RD?flatType=4-ROOM&budget=3000';
const ROUTE = '/streets/:town/:street';

beforeEach(() => vi.restoreAllMocks());

describe('StreetPage', () => {
  it('shows the street summary and requests the decoded names', async () => {
    vi.spyOn(api, 'streetDetail').mockResolvedValue(detail);
    renderAt(PATH, ROUTE, <StreetPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Yishun Ring Rd' })).toBeInTheDocument();
    expect(screen.getByText('S$2,963 to S$3,300')).toBeInTheDocument();
    expect(screen.getByText('Same as Yishun overall')).toBeInTheDocument();
    expect(api.streetDetail).toHaveBeenCalledWith('4-ROOM', 'YISHUN', 'YISHUN RING RD', expect.any(AbortSignal));
  });

  it('decodes town names that contain a slash', async () => {
    vi.spyOn(api, 'streetDetail').mockResolvedValue({ ...detail, town: 'KALLANG/WHAMPOA', street: 'WHAMPOA DR' });
    renderAt('/streets/KALLANG%2FWHAMPOA/WHAMPOA%20DR?flatType=4-ROOM', ROUTE, <StreetPage />);
    await screen.findByRole('heading', { level: 1, name: 'Whampoa Dr' });
    expect(api.streetDetail).toHaveBeenCalledWith('4-ROOM', 'KALLANG/WHAMPOA', 'WHAMPOA DR', expect.any(AbortSignal));
  });

  it('keeps the search filters in the back link, URL-encoded', async () => {
    vi.spyOn(api, 'streetDetail').mockResolvedValue(detail);
    renderAt('/streets/YISHUN/YISHUN%20RING%20RD?flatType=4-ROOM&budget=3000%26x%3D1&town=YISHUN&all=1&junk=1', ROUTE, <StreetPage />);
    const back = await screen.findByRole('link', { name: 'Back to results' });
    expect(back).toHaveAttribute('href', '/?flatType=4-ROOM&budget=3000%26x%3D1&town=YISHUN&all=1');
  });

  it('explains a street with no recent rentals (404)', async () => {
    vi.spyOn(api, 'streetDetail').mockRejectedValue(new RequestError(404, 'No rentals'));
    renderAt(PATH, ROUTE, <StreetPage />);
    expect(await screen.findByRole('heading', { name: 'No recent 4-room rentals on Yishun Ring Rd' })).toBeInTheDocument();
  });

  it('shows a generic error for other failures', async () => {
    vi.spyOn(api, 'streetDetail').mockRejectedValue(new RequestError(500, 'Internal server error'));
    renderAt(PATH, ROUTE, <StreetPage />);
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('Internal server error')).toBeInTheDocument();
  });

  it('has no axe accessibility violations', async () => {
    vi.spyOn(api, 'streetDetail').mockResolvedValue(detail);
    const { container } = renderAt(PATH, ROUTE, <StreetPage />);
    await screen.findByRole('heading', { level: 1, name: 'Yishun Ring Rd' });
    expect(await axeViolations(container)).toEqual([]);
  });
});
