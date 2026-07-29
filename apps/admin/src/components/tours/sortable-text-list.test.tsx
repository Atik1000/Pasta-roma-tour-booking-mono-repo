import * as React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SortableTextList } from './sortable-text-list';

/**
 * The Highlights / What's Included / Good to Know lists on the tour editor.
 *
 * These are driven entirely by the parent's state, so the component is
 * exercised the way the editor uses it — a stateful host — rather than with a
 * spy. A spy would prove `onChange` fired while saying nothing about whether
 * the row a user asked for actually appears.
 */
function Host({ initial = [''] }: { initial?: string[] }) {
  const [items, setItems] = React.useState(initial);

  return (
    <SortableTextList
      legend="Highlights"
      items={items}
      onChange={setItems}
      addLabel="Add Highlight"
    />
  );
}

const rows = () => screen.getAllByRole('textbox');

describe('SortableTextList', () => {
  it('starts with the rows it was given', () => {
    render(<Host initial={['Underground access']} />);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveValue('Underground access');
  });

  it('adds a row when the add button is pressed', async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(rows()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Add Highlight' }));

    expect(rows()).toHaveLength(2);
  });

  it('keeps adding rows on repeated presses', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const add = screen.getByRole('button', { name: 'Add Highlight' });
    await user.click(add);
    await user.click(add);
    await user.click(add);

    expect(rows()).toHaveLength(4);
  });

  it('records what is typed into a row', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.type(rows()[0]!, 'Skip the line');

    expect(rows()[0]).toHaveValue('Skip the line');
  });

  it('types into a newly added row without disturbing the first', async () => {
    const user = userEvent.setup();
    render(<Host initial={['Underground access']} />);

    await user.click(screen.getByRole('button', { name: 'Add Highlight' }));
    await user.type(rows()[1]!, 'Arena floor');

    expect(rows()[0]).toHaveValue('Underground access');
    expect(rows()[1]).toHaveValue('Arena floor');
  });

  it('removes the row that was asked for, not the last one', async () => {
    const user = userEvent.setup();
    render(<Host initial={['first', 'second', 'third']} />);

    await user.click(screen.getByRole('button', { name: 'Remove Highlights item 2' }));

    expect(rows().map((row) => (row as HTMLInputElement).value)).toEqual(['first', 'third']);
  });

  it('reorders from the keyboard, not only by dragging', async () => {
    const user = userEvent.setup();
    render(<Host initial={['first', 'second']} />);

    await user.click(screen.getByRole('button', { name: 'Move Highlights item 2 up' }));

    expect(rows().map((row) => (row as HTMLInputElement).value)).toEqual(['second', 'first']);
  });

  it('disables the moves that would fall off the ends', () => {
    render(<Host initial={['first', 'second']} />);

    expect(screen.getByRole('button', { name: 'Move Highlights item 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Highlights item 2 down' })).toBeDisabled();
  });

  it('survives every row being removed', async () => {
    const user = userEvent.setup();
    render(<Host initial={['only']} />);

    await user.click(screen.getByRole('button', { name: 'Remove Highlights item 1' }));

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    // The list must still offer a way back, or it would be permanently empty.
    expect(screen.getByRole('button', { name: 'Add Highlight' })).not.toBeDisabled();
  });
});
