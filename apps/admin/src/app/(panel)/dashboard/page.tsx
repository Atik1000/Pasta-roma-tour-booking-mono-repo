'use client';

import Link from 'next/link';

import { Button, Card, CardContent, ErrorState, Skeleton, StatCard, StatusPill } from '@pasta/ui';
import { formatMoney, formatTimestamp } from '@pasta/utils';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, MapPinned, Ticket, TrendingUp, Trophy, Users } from 'lucide-react';

import { DashboardCharts } from '@/components/dashboard/dashboard-charts';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PageHeader } from '@/components/layout/admin-shell';
import { adminApi } from '@/lib/session';

const CHART_COLORS = [
  'var(--color-chart-2)',
  'var(--color-chart-1)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
];

export default function DashboardPage() {
  const stats = useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: () => adminApi.admin.dashboardStats(),
  });
  const series = useQuery({
    queryKey: ['admin', 'dashboard', 'series'],
    queryFn: () => adminApi.admin.bookingsSeries(),
  });
  const breakdown = useQuery({
    queryKey: ['admin', 'dashboard', 'breakdown'],
    queryFn: () => adminApi.admin.statusBreakdown(),
  });
  const topTours = useQuery({
    queryKey: ['admin', 'dashboard', 'top-tours'],
    queryFn: () => adminApi.admin.topTours(),
  });
  const recent = useQuery({
    queryKey: ['admin', 'dashboard', 'recent'],
    queryFn: () => adminApi.admin.recentBookings(),
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
        actions={<DateRangePicker />}
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
            ) : (
              <ol className="flex flex-col">
                {(topTours.data ?? []).map((tour, index) => (
                  <li
                    key={tour.title}
                    className="border-border flex items-center gap-4 border-b py-3 last:border-0"
                  >
                    <span className="text-muted-foreground w-4 shrink-0 text-sm tabular-nums">
                      {index + 1}
                    </span>
                    <span
                      role="img"
                      aria-label={tour.title}
                      className="rounded-field size-10 shrink-0 bg-[linear-gradient(140deg,#f3ddb8,#e3b76f_55%,#b5751f)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{tour.title}</span>
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
