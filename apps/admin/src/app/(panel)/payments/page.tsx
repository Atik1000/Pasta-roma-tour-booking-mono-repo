'use client';

import { ErrorState, Skeleton, StatCard } from '@pasta/ui';
import { formatMoney } from '@pasta/utils';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Euro, Undo2 } from 'lucide-react';

import { PageHeader } from '@/components/layout/admin-shell';
import { PaymentsTable } from '@/components/payments/payments-table';
import { adminApi } from '@/lib/session';

/**
 * The Payments area appears in the admin sidebar but was never drawn. It is
 * built from the same patterns as the other listings — KPI row, filter bar,
 * table, pagination — so it reads as part of the same panel.
 */
export default function PaymentsPage() {
  const stats = useQuery({
    queryKey: ['admin', 'payments', 'stats'],
    queryFn: () => adminApi.admin.paymentStats(),
  });

  return (
    <>
      <PageHeader
        title="Payments"
        description="Track collected revenue, outstanding payments, and refunds."
      />

      <section
        aria-label="Payment totals"
        className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.isLoading ? (
          Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)
        ) : stats.isError ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <ErrorState onRetry={() => void stats.refetch()} />
          </div>
        ) : (
          <>
            <StatCard
              label="Collected"
              value={formatMoney(stats.data?.collectedMinor ?? 0)}
              icon={<Euro aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Pending"
              value={formatMoney(stats.data?.pendingMinor ?? 0)}
              icon={<Clock aria-hidden />}
              tone="warning"
            />
            <StatCard
              label="Refunded"
              value={formatMoney(stats.data?.refundedMinor ?? 0)}
              icon={<Undo2 aria-hidden />}
              tone="info"
            />
            <StatCard
              label="Failed Payments"
              value={stats.data?.failed ?? 0}
              icon={<AlertTriangle aria-hidden />}
              tone="danger"
            />
          </>
        )}
      </section>

      <PaymentsTable />
    </>
  );
}
