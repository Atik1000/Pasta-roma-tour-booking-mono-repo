'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCard,
  StatusPill,
  Thumbnail,
} from '@pasta/ui';
import { formatMoney, formatTimestamp } from '@pasta/utils';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, MapPinned, Ticket, TrendingUp, Trophy, Users } from 'lucide-react';

import { DashboardCharts } from '@/components/dashboard/dashboard-charts';
import {
  DateRangePicker,
  defaultRange,
  type DashboardRange,
} from '@/components/dashboard/date-range-picker';
import { PageHeader } from '@/components/layout/admin-shell';
import { adminApi } from '@/lib/session';

const CHART_COLORS = [
  'var(--color-chart-2)',
  'var(--color-chart-1)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
];

/** `YYYY-MM-DD` for the day `days - 1` before `to`, so the window is inclusive. */
function windowStart(to: string, days: number): string {
  const date = new Date(`${to}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  // The header's date range drives every figure on the screen.
  const [range, setRange] = React.useState<DashboardRange>(defaultRange);

  // The Bookings Overview chart has its own period select, independent of the
  // header — the design shows both controls, and they do different jobs.
  const [period, setPeriod] = React.useState('7');

  const params = { from: range.from, to: range.to };

  const stats = useQuery({
    queryKey: ['admin', 'dashboard', 'stats', params],
    queryFn: () => adminApi.admin.dashboardStats(params),
  });
  const series = useQuery({
    queryKey: ['admin', 'dashboard', 'series', { to: range.to, period }],
    queryFn: () =>
      adminApi.admin.bookingsSeries({
        from: windowStart(range.to, Number(period)),
        to: range.to,
      }),
  });
  const breakdown = useQuery({
    queryKey: ['admin', 'dashboard', 'breakdown', params],
    queryFn: () => adminApi.admin.statusBreakdown(params),
  });
  const topTours = useQuery({
    queryKey: ['admin', 'dashboard', 'top-tours', params],
    queryFn: () => adminApi.admin.topTours(params),
  });
  const recent = useQuery({
    queryKey: ['admin', 'dashboard', 'recent', params],
    queryFn: () => adminApi.admin.recentBookings(params),
  });

  if (stats.isError) {
    return <ErrorState onRetry={() => void stats.refetch()} />;
  }

  // Label + value only: the percentage deltas and comparison sublines drawn on
  // these cards were struck from the design.
  const cards = stats.data
    ? [
        {
          label: 'Total Bookings',
          value: stats.data.totalBookings,
          icon: <Ticket aria-hidden />,
          tone: 'info' as const,
        },
        {
          label: 'Total Revenue',
          value: formatMoney(stats.data.totalRevenueMinor),
          icon: <TrendingUp aria-hidden />,
          tone: 'success' as const,
        },
        {
          label: 'Total Customers',
          value: stats.data.totalCustomers,
          icon: <Users aria-hidden />,
          tone: 'info' as const,
        },
        {
          label: 'Active Tours',
          value: stats.data.activeTours,
          icon: <MapPinned aria-hidden />,
          tone: 'warning' as const,
        },
        {
          label: 'Pending Payments',
          value: stats.data.pendingPayments,
          icon: <CreditCard aria-hidden />,
          tone: 'danger' as const,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's what's happening with your business today."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <section aria-label="Key figures" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.isLoading
          ? Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24" />)
          : cards.map((card) => <StatCard key={card.label} {...card} />)}
      </section>

      {/* Bookings Overview + Bookings by Status. The Revenue Overview chart that
          sat alongside them was struck from the design. */}
      <DashboardCharts
        series={series.data ?? []}
        breakdown={(breakdown.data ?? []).map((slice, index) => ({
          ...slice,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }))}
        period={period}
        onPeriodChange={setPeriod}
        isLoading={series.isLoading || breakdown.isLoading}
      />

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                <Trophy className="text-primary size-5" aria-hidden />
                Top Tours by Bookings
              </h2>
              <Button variant="outline" size="sm" asChild>
                <Link href="/tours">View All</Link>
              </Button>
            </div>

            {topTours.isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-12" />
                ))}
              </div>
            ) : (topTours.data ?? []).length === 0 ? (
              <EmptyState
                title="No bookings in this range"
                description="Once tours are booked, the most popular appear here."
              />
            ) : (
              <ol className="flex flex-col">
                {(topTours.data ?? []).map((tour, index) => (
                  <li
                    key={tour.id ?? tour.title}
                    className="border-border flex items-center gap-4 border-b py-3 last:border-0"
                  >
                    <span className="text-muted-foreground w-4 shrink-0 text-sm tabular-nums">
                      {index + 1}
                    </span>
                    <Thumbnail src={tour.coverImage} alt={tour.title} className="size-10" />
                    {/* A tour deleted since it was booked has no id to link to. */}
                    {tour.id ? (
                      <Link
                        href={`/tours/${tour.id}`}
                        className="hover:text-primary min-w-0 flex-1 truncate text-sm transition-colors"
                      >
                        {tour.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                        {tour.title}
                      </span>
                    )}
                    <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                      {tour.bookings} bookings
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Recent Bookings</h2>
              <Button variant="outline" size="sm" asChild>
                <Link href="/bookings">View All</Link>
              </Button>
            </div>

            {recent.isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </div>
            ) : (recent.data ?? []).length === 0 ? (
              <EmptyState
                title="No bookings in this range"
                description="Widen the date range to see earlier bookings."
              />
            ) : (
              <ul className="flex flex-col">
                {(recent.data ?? []).map((booking) => (
                  <li
                    key={booking.reference}
                    className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-0"
                  >
                    <Link
                      href={`/bookings/${booking.reference}`}
                      className="text-primary text-sm hover:underline"
                    >
                      {booking.reference}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm">{booking.customer}</span>
                    <span className="text-sm tabular-nums">{formatMoney(booking.amountMinor)}</span>
                    <StatusPill status={booking.status} />
                    <span className="text-muted-foreground w-20 shrink-0 text-right text-xs">
                      {formatTimestamp(booking.bookedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
