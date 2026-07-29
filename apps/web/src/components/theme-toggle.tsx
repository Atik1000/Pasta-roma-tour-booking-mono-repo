'use client';

import { useIsMounted } from '@pasta/hooks';
import { Button } from '@pasta/ui';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isMounted = useIsMounted();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="subtle"
      size="icon"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {/* Render a stable icon until hydration so SSR markup matches. */}
      {isMounted && isDark ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </Button>
  );
}
