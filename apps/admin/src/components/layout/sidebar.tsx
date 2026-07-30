'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { cn } from '@pasta/ui';
import {
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPinned,
  PenLine,
} from 'lucide-react';

import { signOut } from '@/lib/session';

import { ColosseumMark, SkylineBackdrop } from './brand';

/** The five areas drawn in the admin design — nothing more. */
export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Tours', href: '/tours', icon: MapPinned },
  { label: 'Bookings', href: '/bookings', icon: CalendarDays },
  { label: 'Payments', href: '/payments', icon: CreditCard },
  { label: 'Blogs', href: '/blogs', icon: PenLine },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="bg-sidebar-gradient text-sidebar-foreground relative flex h-full flex-col overflow-hidden p-4">
      <SkylineBackdrop className="text-white/[0.06]" />

      <div className="relative mb-8 flex items-center gap-2.5 px-3 pt-4">
        <ColosseumMark className="text-primary size-8" />
        <span className="flex flex-col leading-none">
          <span className="font-display text-lg font-semibold">Pasta Roma Tour</span>
          <span className="text-sidebar-muted-foreground mt-1 text-xs">Admin Panel</span>
        </span>
      </div>

      <nav aria-label="Admin sections" className="relative flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-field flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40',
                isActive
                  ? 'bg-brand-gradient text-sidebar-accent-foreground font-medium shadow-sm'
                  : 'text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-white/5',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}

        {/*
          A real sign-out, not a link to the login screen. As a plain link this
          left the access token in memory and the refresh cookie alive, so
          navigating back — or any other tab — was still signed in.
        */}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            void signOut().finally(() => router.replace('/login'));
          }}
          className="rounded-field text-sidebar-foreground/85 hover:text-sidebar-foreground mt-auto flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        >
          <LogOut className="size-5 shrink-0" aria-hidden />
          Logout
        </button>
      </nav>
    </div>
  );
}
