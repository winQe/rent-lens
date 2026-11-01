import type { StreetsResponse, TownsResponse } from '@rent-lens/shared';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api.ts';
import { BudgetPage } from '../src/pages/BudgetPage.tsx';
import { axeViolations, renderAt } from './render.tsx';

const window = { fromMonth: '2025-10', toMonth: '2026-09' };

const towns: TownsResponse = {
  flatType: '4-ROOM',
  budget: 3000,
  window,
  towns: [
    { town: 'BUKIT PANJANG', rentals: 407, withinBudget: 228, share: 0.56, lowData: false },
    { town: 'TENGAH', rentals: 5, withinBudget: 0, share: 0, lowData: true },
    { town: 'WOODLANDS', rentals: 720, withinBudget: 338, share: 0.47, lowData: false },
  ],
};

const streets: StreetsResponse = {
  flatType: '4-ROOM',
  budget: 3000,
  window,
  fitCount: 43,
  lowDataCount: 169,
  total: 366,
  page: 1,
  pageSize: 12,
  items: [
    { town: 'WOODLANDS', street: 'MARSILING DR', rentals: 54, withinBudget: 40, share: 0.74, p25: 2800, median: 3000, p75: 3075, lowData: false },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'towns').mockResolvedValue(towns);
  vi.spyOn(api, 'streets').mockResolvedValue(streets);
});

describe('BudgetPage', () => {
  it('shows how many streets fit and the best streets', async () => {
    renderAt('/?budget=3000', '/', <BudgetPage />);
    expect(await screen.findByRole('heading', { name: '43 streets fit your budget' })).toBeInTheDocument();
    expect(screen.getByText('Marsiling Dr')).toBeInTheDocument();
    expect(screen.getByText(/Most rents: S\$2,800 to S\$3,075/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Marsiling Dr/ })).toHaveAttribute(
      'href',
      '/streets/WOODLANDS/MARSILING%20DR?flatType=4-ROOM&budget=3000',
    );
  });

  it('lists the top five towns by share, leaving out towns with too few rentals', async () => {
    const row = (town: string, share: number, lowData = false) => ({ town, rentals: lowData ? 5 : 400, withinBudget: 0, share, lowData });
    vi.mocked(api.towns).mockResolvedValue({
      ...towns,
      // Unsorted on purpose, with six towns that have enough rentals.
      towns: [
        row('YISHUN', 0.43),
        row('TENGAH', 1, true),
        row('PUNGGOL', 0.21),
        row('BUKIT PANJANG', 0.56),
        row('SEMBAWANG', 0.46),
        row('BEDOK', 0.27),
        row('WOODLANDS', 0.47),
      ],
    });
    renderAt('/', '/', <BudgetPage />);
    const buttons = await screen.findAllByRole('button', { pressed: false });
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Bukit Panjang56% fit',
      'Woodlands47% fit',
      'Sembawang46% fit',
      'Yishun43% fit',
      'Bedok27% fit',
    ]);
  });

  it('requests the new budget after the slider moves', async () => {
    renderAt('/?budget=3000', '/', <BudgetPage />);
    await screen.findByRole('heading', { name: /streets fit/ });
    fireEvent.change(screen.getByRole('slider', { name: 'Monthly budget' }), { target: { value: '4200' } });
    expect(screen.getByText('S$4,200', { selector: 'output' })).toBeInTheDocument();
    await vi.waitFor(() => expect(api.streets).toHaveBeenLastCalledWith(expect.objectContaining({ budget: 4200 }), expect.any(AbortSignal)));
  });

  it('includes low-data streets when the box is ticked', async () => {
    renderAt('/', '/', <BudgetPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Include 169 streets with under 10 rentals' }));
    await vi.waitFor(() => expect(api.streets).toHaveBeenLastCalledWith(expect.objectContaining({ includeLowData: true }), expect.any(AbortSignal)));
  });

  it('snaps a budget from the URL to the slider range and step', async () => {
    renderAt('/?budget=99999', '/', <BudgetPage />);
    expect(screen.getByRole('slider', { name: 'Monthly budget' })).toHaveValue('6000');
    await vi.waitFor(() => expect(api.streets).toHaveBeenLastCalledWith(expect.objectContaining({ budget: 6000 }), expect.any(AbortSignal)));
  });

  it('uses the default budget when the URL value is empty', async () => {
    renderAt('/?budget=', '/', <BudgetPage />);
    expect(screen.getByRole('slider', { name: 'Monthly budget' })).toHaveValue('3000');
  });

  it('rounds a decimal budget instead of sending it to the API', async () => {
    renderAt('/?budget=2999.5', '/', <BudgetPage />);
    await vi.waitFor(() => expect(api.streets).toHaveBeenLastCalledWith(expect.objectContaining({ budget: 3000 }), expect.any(AbortSignal)));
  });

  it('explains a map that is one colour because every town fits', async () => {
    const row = (town: string, share: number, lowData = false) => ({ town, rentals: lowData ? 3 : 50, withinBudget: 0, share, lowData });
    vi.mocked(api.towns).mockResolvedValue({ ...towns, towns: [row('YISHUN', 1), row('BEDOK', 0.88), row('TENGAH', 0.2, true)] });
    renderAt('/?flatType=2-ROOM&budget=3000', '/', <BudgetPage />);
    expect(await screen.findByText('At least 75% of 2-room rents fit S$3,000 in every town. Lower the budget to compare towns.')).toBeInTheDocument();
  });

  it('says so when the town map cannot be loaded', async () => {
    vi.mocked(api.towns).mockRejectedValue(new Error('Server error'));
    renderAt('/', '/', <BudgetPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the town map: Server error');
  });

  it('reads flat type from the URL and requests that type', async () => {
    renderAt('/?flatType=3-ROOM&budget=2500', '/', <BudgetPage />);
    await screen.findByRole('heading', { name: /streets fit/ });
    expect(screen.getByRole('radio', { name: '3-room' })).toBeChecked();
    expect(api.streets).toHaveBeenCalledWith(expect.objectContaining({ flatType: '3-ROOM', budget: 2500 }), expect.any(AbortSignal));
  });

  it('filters by town when a top town is picked', async () => {
    renderAt('/', '/', <BudgetPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Woodlands/ }));
    expect(await screen.findByRole('button', { name: /Woodlands/, pressed: true })).toBeInTheDocument();
    expect(api.streets).toHaveBeenLastCalledWith(expect.objectContaining({ town: 'WOODLANDS' }), expect.any(AbortSignal));
  });

  it('keeps the active filters in street links', async () => {
    renderAt('/?budget=3000&town=WOODLANDS&all=1', '/', <BudgetPage />);
    const card = await screen.findByRole('link', { name: /Marsiling Dr/ });
    expect(card).toHaveAttribute('href', '/streets/WOODLANDS/MARSILING%20DR?flatType=4-ROOM&budget=3000&town=WOODLANDS&all=1');
  });

  it('clears a town that has no rentals of the chosen flat type', async () => {
    renderAt('/?town=NOWHERE', '/', <BudgetPage />);
    await screen.findByRole('heading', { name: /streets fit/ });
    await vi.waitFor(() => expect(api.streets).toHaveBeenLastCalledWith(expect.objectContaining({ town: undefined }), expect.any(AbortSignal)));
    expect(screen.getByRole('combobox', { name: 'Town' })).toHaveValue('');
  });

  it('says so when no street fits the budget', async () => {
    vi.mocked(api.streets).mockResolvedValue({ ...streets, fitCount: 0, total: 0, items: [] });
    renderAt('/?budget=1000', '/', <BudgetPage />);
    expect(await screen.findByRole('heading', { name: 'No streets where most 4-room rents are within S$1,000' })).toBeInTheDocument();
    expect(screen.getByText('No streets match. Try a higher budget or another town.')).toBeInTheDocument();
  });

  it('shows an alert when results cannot be loaded', async () => {
    vi.mocked(api.streets).mockRejectedValue(new Error('Too many requests, please try again in a minute.'));
    renderAt('/', '/', <BudgetPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load results: Too many requests, please try again in a minute.');
  });

  it('has no axe accessibility violations', async () => {
    const { container } = renderAt('/', '/', <BudgetPage />);
    await screen.findByRole('heading', { name: /streets fit/ });
    expect(await axeViolations(container)).toEqual([]);
  });
});
