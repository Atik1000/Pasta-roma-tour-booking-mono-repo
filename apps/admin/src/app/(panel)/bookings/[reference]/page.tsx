'use client';

import * as React from 'react';

import { ErrorState, Skeleton } from '@pasta/ui';
import { useQuery } from '@tanstack/react-query';

import { BookingDetail } from '@/components/bookings/booking-detail';
import { adminApi } from '@/lib/session';

export default function BookingDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = React.use(params);

  const query = useQuery({
    queryKey: ['admin', 'booking', reference],
    queryFn: () => adminApi.admin.booking(reference),
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-6 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Booking not found"
        description="That booking could not be loaded. It may have been removed."
        onRetry={() => void query.refetch()}
      />
    );
  }

  return <BookingDetail booking={query.data} />;
}
