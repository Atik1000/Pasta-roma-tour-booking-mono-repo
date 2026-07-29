'use client';

import * as React from 'react';

import { Button, ErrorState, Skeleton, StatCard } from '@pasta/ui';
import { formatMoney } from '@pasta/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarCheck, CheckCircle2, Clock, Download, Euro, XCircle } from 'lucide-react';

import { BookingsTable, type BookingFilters } from '@/components/bookings/bookings-table';
import { PageHeader } from '@/components/layout/admin-shell';
import { saveBlob } from '@/lib/download';
import { adminApi } from '@/lib/session';

export default function BookingsPage() {
  const [filters, setFilters] = React.useState<BookingFilters>({
    search: '',
    status: 'ALL',
    payment: 'ALL',
  });

  const stats = useQuery({
    queryKey: ['admin', 'bookings', 'stats'],
    queryFn: () => adminApi.admin.bookingStats(),
  });

  // The export mirrors whatever the table is showing, rather than always
  // dumping every booking.
  const exportBookings = useMutation({
    mutationFn: () =>
      adminApi.admin.exportBookings({
        search: filters.search.trim() || undefined,
        status: filters.status,
      }),
    onSuccess: (csv) => saveBlob(csv, 'bookings.csv'),
  });

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Manage customer bookings, payment status, and booking records."
        actions={
          <Button
            leadingIcon={<Download aria-hidden />}
            isLoading={exportBookings.isPending}
            onClick={() => exportBookings.mutate()}
          >
            Export Bookings
          </Button>
        }
      />

      <section
        aria-label="Booking totals"
        className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {stats.isLoading ? (
          Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24" />)
        ) : stats.isError ? (
          <div className="sm:col-span-2 xl:col-span-5">
            <ErrorState onRetry={() => void stats.refetch()} />
          </div>
        ) : (
          <>
            <StatCard
              label="Total Bookings"
              value={stats.data?.total ?? 0}
              icon={<CalendarCheck aria-hidden />}
              tone="warning"
            />
            <StatCard
              label="Confirmed Bookings"
              value={stats.data?.confirmed ?? 0}
              icon={<CheckCircle2 aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Pending Bookings"
              value={stats.data?.pending ?? 0}
              icon={<Clock aria-hidden />}
              tone="warning"
            />
            <StatCard
              label="Cancelled Bookings"
              value={stats.data?.cancelled ?? 0}
              icon={<XCircle aria-hidden />}
              tone="danger"
            />
            <StatCard
              label="Total Revenue"
              value={formatMoney(stats.data?.revenueMinor ?? 0)}
              icon={<Euro aria-hidden />}
              tone="info"
            />
          </>
        )}
      </section>

      <BookingsTable filters={filters} onFiltersChange={setFilters} />
    </>
  );
}
