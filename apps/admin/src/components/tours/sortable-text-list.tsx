'use client';

import * as React from 'react';

import { Button, cn, Input } from '@pasta/ui';
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';

export interface SortableTextListProps {
  legend: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  placeholder?: string;
}

/**
 * The reorderable Highlights / What's Included / Good to Know lists.
 *
 * Pointer dragging is supported via the grip, and every reorder is also
 * reachable from the keyboard through the up/down controls — drag-only
 * reordering would leave the list unusable without a mouse.
 */
export function SortableTextList({
  legend,
  items,
  onChange,
  addLabel,
  placeholder = 'Enter a line…',
}: SortableTextListProps) {
  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 font-medium">{legend}</legend>

      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={index}
            draggable
            onDragStart={() => setDraggingIndex(index)}
            onDragEnd={() => setDraggingIndex(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingIndex !== null) move(draggingIndex, index);
              setDraggingIndex(null);
            }}
            className={cn(
              'rounded-field flex items-center gap-2 transition-opacity',
              draggingIndex === index && 'opacity-50',
            )}
          >
            <span
              aria-hidden
              className="text-muted-foreground cursor-grab active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="size-4" />
            </span>

            <Input
              value={item}
              placeholder={placeholder}
              aria-label={`${legend} item ${index + 1}`}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                onChange(next);
              }}
              className="h-10"
            />

            <span className="flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Move ${legend} item ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ChevronUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Move ${legend} item ${index + 1} down`}
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ChevronDown aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-danger hover:bg-danger-soft size-8"
                aria-label={`Remove ${legend} item ${index + 1}`}
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        block
        leadingIcon={<Plus aria-hidden />}
        onClick={() => onChange([...items, ''])}
      >
        {addLabel}
      </Button>
    </fieldset>
  );
}
