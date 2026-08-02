import * as React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Combobox, type ComboboxOption } from '../components/combobox';

/**
 * The searchable select exists because a 250-country list is unusable by
 * scrolling. These cover the parts that make it usable: filtering, keyboard
 * commitment, and the highlight staying honest as the list changes underneath.
 */

const OPTIONS: ComboboxOption[] = [
  { value: 'IT', label: 'Italy', prefix: '🇮🇹', keywords: 'IT' },
  { value: 'FR', label: 'France', prefix: '🇫🇷', keywords: 'FR' },
  { value: 'DE', label: 'Germany', prefix: '🇩🇪', keywords: 'DE' },
  { value: 'CH', label: 'Switzerland', prefix: '🇨🇭', keywords: 'CH' },
];

function Harness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = React.useState('IT');

  return (
    <Combobox
      aria-label="Country"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('Combobox', () => {
  it('shows the selected option on the trigger', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Country' })).toHaveTextContent('Italy');
  });

  it('narrows the list as you type', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Country' }));
    await user.type(screen.getByRole('combobox'), 'ger');

    expect(screen.getByRole('option', { name: /germany/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /italy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /france/i })).not.toBeInTheDocument();
  });

  it('matches on hidden keywords, so an ISO code finds the country', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Country' }));
    await user.type(screen.getByRole('combobox'), 'ch');

    expect(screen.getByRole('option', { name: /switzerland/i })).toBeInTheDocument();
  });

  it('commits the highlighted match on Enter and closes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Country' }));
    await user.type(screen.getByRole('combobox'), 'fra');
    await user.keyboard('{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('FR');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Country' })).toHaveTextContent('France');
  });

  /**
   * The highlight is an index into the filtered list. If a new search left it
   * where it was, Enter would commit whichever option happened to land there.
   */
  it('resets the highlight to the top when the search changes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Country' }));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.type(screen.getByRole('combobox'), 'an');
    await user.keyboard('{Enter}');

    // "an" matches France, Germany and Switzerland, in that order. A stale
    // index 2 would have committed Switzerland.
    expect(onValueChange).toHaveBeenCalledWith('FR');
  });

  it('reports when nothing matches instead of showing an empty box', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Country' }));
    await user.type(screen.getByRole('combobox'), 'zzz');

    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('drops the previous search when reopened', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Country' }));
    await user.type(screen.getByRole('combobox'), 'ger');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Country' }));
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length);
  });
});
