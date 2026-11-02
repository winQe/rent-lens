import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api.ts';
import { RentCheck } from '../src/components/RentCheck.tsx';
import { axeViolations, renderAt } from './render.tsx';

const histogram = [
  { from: 2800, to: 3000, count: 10 },
  { from: 3000, to: 3200, count: 40 },
  { from: 3200, to: 3400, count: 30 },
  { from: 3400, to: 3600, count: 8 },
];

const ui = <RentCheck flatType="4-ROOM" town="YISHUN" street="YISHUN RING RD" histogram={histogram} />;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'rentCheck').mockResolvedValue({
    flatType: '4-ROOM',
    rent: 3400,
    comparedWith: 'street',
    town: 'YISHUN',
    street: 'YISHUN RING RD',
    rentals: 138,
    lower: 116,
    equal: 7,
    shareLower: 116 / 138,
    p25: 2963,
    p75: 3300,
    verdict: 'above',
    lowData: false,
  });
});

describe('RentCheck', () => {
  it('shows the verdict for a rent', async () => {
    renderAt('/', '/', ui);
    await userEvent.type(screen.getByLabelText('Monthly rent'), '3,400');
    await userEvent.click(screen.getByRole('button', { name: 'Check rent' }));

    expect(await screen.findByText('Above most rents')).toBeInTheDocument();
    expect(screen.getByText('S$3,400 is more than 84% of recent rents on this street.')).toBeInTheDocument();
    expect(api.rentCheck).toHaveBeenCalledWith('4-ROOM', 'YISHUN', 'YISHUN RING RD', 3400, expect.any(AbortSignal));
    // The rent's bar is named in words, not only by colour.
    expect(screen.getByText('Your rent is in the outlined bar: S$3,400 to S$3,599, with 8 rentals.')).toBeInTheDocument();
    expect(screen.queryByText(/rough guide/)).not.toBeInTheDocument();
  });

  it('warns when even the town has too few rentals', async () => {
    vi.mocked(api.rentCheck).mockResolvedValue({
      flatType: '4-ROOM',
      rent: 3000,
      comparedWith: 'town',
      town: 'TENGAH',
      street: 'TENGAH DR',
      rentals: 5,
      lower: 1,
      equal: 0,
      shareLower: 0.2,
      p25: 3200,
      p75: 3500,
      verdict: 'below',
      lowData: true,
    });
    renderAt('/', '/', ui);
    await userEvent.type(screen.getByLabelText('Monthly rent'), '3000');
    await userEvent.click(screen.getByRole('button', { name: 'Check rent' }));
    expect(await screen.findByText('The town also has only 5 rentals of this type, so treat this as a rough guide.')).toBeInTheDocument();
  });

  it('shows the error when the check fails', async () => {
    vi.mocked(api.rentCheck).mockRejectedValue(new Error('Too many requests, please try again in a minute.'));
    renderAt('/', '/', ui);
    await userEvent.type(screen.getByLabelText('Monthly rent'), '3000');
    await userEvent.click(screen.getByRole('button', { name: 'Check rent' }));
    expect(await screen.findByText('Could not check this rent: Too many requests, please try again in a minute.')).toBeInTheDocument();
  });

  it('says when it compared with the whole town', async () => {
    vi.mocked(api.rentCheck).mockResolvedValue({
      flatType: '4-ROOM',
      rent: 3000,
      comparedWith: 'town',
      town: 'YISHUN',
      street: 'YISHUN ST 20',
      rentals: 809,
      lower: 205,
      equal: 141,
      shareLower: 205 / 809,
      p25: 2950,
      p75: 3300,
      verdict: 'usual',
      lowData: false,
    });
    renderAt('/', '/', ui);
    await userEvent.type(screen.getByLabelText('Monthly rent'), '3000');
    await userEvent.click(screen.getByRole('button', { name: 'Check rent' }));
    expect(await screen.findByText('S$3,000 is more than 25% of recent rents in this town.')).toBeInTheDocument();
    expect(screen.getByText(/too few rentals to compare on its own, so we used the whole town/)).toBeInTheDocument();
    // The histogram shows the street, so a town comparison marks no bar.
    expect(screen.queryByText(/Your rent is in the outlined bar/)).not.toBeInTheDocument();
  });

  it('rejects input it cannot check, without calling the API', async () => {
    renderAt('/', '/', ui);
    await userEvent.type(screen.getByLabelText('Monthly rent'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Check rent' }));

    expect(screen.getByText(/Enter a whole-dollar rent between S\$300 and S\$10,000/)).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly rent')).toHaveAttribute('aria-invalid', 'true');
    expect(api.rentCheck).not.toHaveBeenCalled();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = renderAt('/', '/', ui);
    expect(await axeViolations(container)).toEqual([]);
  });
});
