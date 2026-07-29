'use client';

import * as React from 'react';

/** Debounces a rapidly changing value — used by every search input. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** SSR-safe media query subscription. */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

export interface Disclosure {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** Open/close state for dialogs, drawers and dropdowns. */
export function useDisclosure(initial = false): Disclosure {
  const [isOpen, setIsOpen] = React.useState(initial);
  return {
    isOpen,
    open: React.useCallback(() => setIsOpen(true), []),
    close: React.useCallback(() => setIsOpen(false), []),
    toggle: React.useCallback(() => setIsOpen((previous) => !previous), []),
  };
}

/** Detects clicks outside a referenced element (menus, popovers). */
export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
): void {
  React.useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const element = ref.current;
      if (!element || element.contains(event.target as Node)) return;
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

/** `localStorage`-backed state that tolerates SSR and private-mode failures. */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [stored, setStored] = React.useState<T>(initialValue);

  React.useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) setStored(JSON.parse(item) as T);
    } catch {
      // Ignore malformed or inaccessible storage.
    }
  }, [key]);

  const setValue = React.useCallback(
    (value: T) => {
      setStored(value);
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage may be full or blocked; in-memory state still updates.
      }
    },
    [key],
  );

  return [stored, setValue];
}

/** True only after hydration — guards against SSR/client markup mismatches. */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}
