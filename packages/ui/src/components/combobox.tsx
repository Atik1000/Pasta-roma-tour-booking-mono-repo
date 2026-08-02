'use client';

import * as React from 'react';

import { Check, ChevronDown, Search } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from './menus';
import { cn } from '../lib/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Rendered before the label — a flag, a swatch, an avatar. Decorative. */
  prefix?: React.ReactNode;
  /** Second line under the label. Also searched. */
  hint?: string;
  /** Extra terms the search should match but that are not shown. */
  keywords?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /** The selected option's `value`, or `''` for nothing selected. */
  value: string;
  onValueChange: (value: string) => void;
  /** Shown on the trigger when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  className?: string;
  /** Widths other than the trigger's, for filter bars that need a wider list. */
  contentClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * A select you can type into.
 *
 * `Select` is the right control up to a couple of dozen options; past that,
 * scrolling to find one is the slow part. This keeps the same trigger and
 * popover styling but puts a search box above the list, so a 250-country list
 * is two keystrokes rather than a scroll. Built on Popover rather than
 * Select because Radix's Select owns keystrokes for its own typeahead and will
 * not let a text field inside it keep focus.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  id,
  name,
  disabled,
  required,
  invalid,
  className,
  contentClassName,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);

  const listId = React.useId();
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const selected = options.find((option) => option.value === value);

  const matches = React.useMemo(() => {
    const term = normalize(search.trim());
    if (term === '') return options;
    return options.filter((option) =>
      normalize(`${option.label} ${option.hint ?? ''} ${option.keywords ?? ''}`).includes(term),
    );
  }, [options, search]);

  // A fresh search means the old highlight points at the wrong row, and Enter
  // would commit whatever happens to sit at that index.
  React.useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  // Opening should land on the current selection, not the top of the list.
  React.useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    const current = options.findIndex((option) => option.value === value);
    setActiveIndex(current === -1 ? 0 : current);
  }, [open, options, value]);

  // Keep the highlighted row inside the scroll port for both keyboard paging
  // and the jump-to-selection on open.
  React.useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, matches]);

  function commit(index: number) {
    const option = matches[index];
    if (!option) return;
    onValueChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (matches.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % matches.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + matches.length) % matches.length);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(matches.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        commit(activeIndex);
        break;
      default:
        break;
    }
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-invalid={invalid || undefined}
          className={cn(
            'rounded-field border-input bg-card flex h-11 w-full items-center justify-between gap-2 border px-4 text-sm',
            'focus-visible:border-primary focus-visible:outline-ring focus-visible:outline-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'aria-invalid:border-danger',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected?.prefix ? <span aria-hidden>{selected.prefix}</span> : null}
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>

      {/* A hidden mirror so the value takes part in native form validation. */}
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}

      <PopoverContent
        align="start"
        className={cn(
          'w-[var(--radix-popover-trigger-width)] min-w-56 overflow-hidden p-0',
          contentClassName,
        )}
        onOpenAutoFocus={(event) => {
          // Radix focuses the content wrapper; the search box is the point.
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="border-border relative border-b">
          <Search
            className="text-muted-foreground pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="placeholder:text-muted-foreground h-11 w-full bg-transparent pl-10 pr-3 text-sm outline-none"
          />
        </div>

        <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
          {matches.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">{emptyText}</p>
          ) : (
            matches.map((option, index) => {
              const isActive = index === activeIndex;
              const isSelected = option.value === value;

              return (
                <div
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center gap-2 rounded-[0.5rem] py-2 pl-3 pr-9 text-sm',
                    isActive && 'bg-accent text-accent-foreground',
                  )}
                >
                  {option.prefix ? <span aria-hidden>{option.prefix}</span> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="text-muted-foreground block truncate text-xs">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <Check className="text-primary absolute right-3 size-4" aria-hidden />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
