'use client';

import * as React from 'react';

import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@pasta/ui';
import { initials } from '@pasta/utils';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

import { signOut, useSession } from '@/lib/session';

import { SidebarNav } from './sidebar';

/** ADMIN and EDITOR are the stored values; the header shows them in prose. */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  EDITOR: 'Editor',
};

/**
 * The admin chrome: fixed navy sidebar on large screens, a slide-over on small
 * ones, and a top bar carrying the account menu.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isDark = resolvedTheme === 'dark';

  // The account menu described a fictional "Admin User" regardless of who was
  // signed in, while the session already held the real record.
  const user = useSession((state) => state.user);
  const displayName = user?.name ?? 'Signed in';
  const roleLabel = user ? (ROLE_LABELS[user.role] ?? user.role) : '';

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface/95 sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="subtle" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-0 p-0">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="subtle"
              size="icon"
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              {isDark ? <Moon aria-hidden /> : <Sun aria-hidden />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-field hover:bg-muted focus-visible:outline-ring flex items-center gap-2.5 px-2 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2">
                <Avatar className="size-8">
                  <AvatarFallback>{initials(displayName)}</AvatarFallback>
                </Avatar>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-medium leading-tight">{displayName}</span>
                  <span className="text-muted-foreground block text-xs">{roleLabel}</span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{user?.email ?? 'Not signed in'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onSelect={() => {
                    // Clears the in-memory token and revokes the refresh cookie
                    // server-side; the redirect is what the guard reacts to.
                    void signOut().finally(() => router.replace('/login'));
                  }}
                >
                  <LogOut aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" className="bg-surface flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page title + description + optional actions, used by every admin screen. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
