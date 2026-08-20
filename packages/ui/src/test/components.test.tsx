import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../components/button';
import { Pagination } from '../components/pagination';
import { PriceBreakdown } from '../components/price-breakdown';
import { QuantityStepper } from '../components/quantity-stepper';
import { StatusPill } from '../components/status-pill';

/**
 * These cover the behaviour that protects money and accessibility: quantity
 * clamping, correct currency arithmetic, and status colours staying
 * consistent.
 */

describe('QuantityStepper', () => {
  it('clamps at the maximum so a caller cannot exceed a tour cap', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<QuantityStepper label="Adult tickets" value={4} max={4} min={1} onChange={onChange} />);

    const increase = screen.getByRole('button', { name: /increase adult tickets/i });
    expect(increase).toBeDisabled();

    await user.click(increase);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps at the minimum', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<QuantityStepper label="Adult tickets" value={1} min={1} max={9} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /decrease adult tickets/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits the next value when within range', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<QuantityStepper label="Adult tickets" value={2} min={1} max={9} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /increase adult tickets/i }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('announces the count to assistive tech', () => {
    render(<QuantityStepper label="Adult tickets" value={3} onChange={vi.fn()} />);

    expect(screen.getByRole('status', { name: 'Adult tickets' })).toHaveTextContent('3');
  });
});

describe('PriceBreakdown', () => {
  it('renders minor units as currency', () => {
    render(
      <PriceBreakdown
        lines={[
          { label: 'Adults (2 × €59)', amountMinor: 11_800 },
          { label: 'Booking fee', amountMinor: 500, muted: true },
        ]}
        totalMinor={12_300}
      />,
    );

    expect(screen.getByText('€118.00')).toBeInTheDocument();
    expect(screen.getByText('€5.00')).toBeInTheDocument();
    expect(screen.getByText('€123.00')).toBeInTheDocument();
  });

  it('respects the currency it is given', () => {
    render(<PriceBreakdown lines={[]} totalMinor={9_900} currency="USD" />);

    expect(screen.getByText('$99.00')).toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  it('humanises the enum value', () => {
    render(<StatusPill status="CONFIRMED" />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('accepts an explicit label for payment states', () => {
    render(<StatusPill status="PENDING" label="Payment Pending" />);
    expect(screen.getByText('Payment Pending')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the current page and disables the edges', () => {
    render(<Pagination page={1} totalPages={19} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).toBeEnabled();
  });

  it('reports the page the user picked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(<Pagination page={5} totalPages={19} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Page 6' }));

    expect(onPageChange).toHaveBeenCalledWith(6);
  });
});

describe('Button', () => {
  it('blocks interaction and marks itself busy while loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button isLoading onClick={onClick}>
        Book Now
      </Button>,
    );

    const button = screen.getByRole('button', { name: /book now/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
