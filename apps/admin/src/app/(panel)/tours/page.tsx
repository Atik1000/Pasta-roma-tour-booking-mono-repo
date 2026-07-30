'use client';

import * as React from 'react';

import Link from 'next/link';

import { Button, ErrorState, Skeleton, StatCard } from '@pasta/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileText, Landmark, MapPin, Plus } from 'lucide-react';

import { PageHeader } from '@/components/layout/admin-shell';
import { AddLocationDialog } from '@/components/tours/add-location-dialog';
import { ToursTable } from '@/components/tours/tours-table';
import { adminApi } from '@/lib/session';

export default function ToursPage() {
  const [addingLocation, setAddingLocation] = React.useState(false);

  const stats = useQuery({
    queryKey: ['admin', 'tours', 'stats'],
    queryFn: () => adminApi.admin.tourStats(),
  });
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: () => adminApi.admin.locations(),
  });

  return (
    <>
      <PageHeader
        title="Tours"
        description="Manage all tours, view details, and keep your offerings up to date."
        actions={
          <>
            <Button
              variant="outline"
              leadingIcon={<Plus aria-hidden />}
              onClick={() => setAddingLocation(true)}
            >
              Add New Location
            </Button>
            <Button asChild leadingIcon={<Plus aria-hidden />}>
              <Link href="/tours/new">Add New Tour</Link>
            </Button>
          </>
        }
      />

      <section aria-label="Tour totals" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.isLoading ? (
          Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)
        ) : stats.isError ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <ErrorState onRetry={() => void stats.refetch()} />
          </div>
        ) : (
          <>
            <StatCard
              label="Total Tours"
              value={stats.data?.total ?? 0}
              hint="All time tours"
              icon={<Landmark aria-hidden />}
              tone="warning"
            />
            <StatCard
              label="Published Tours"
              value={stats.data?.published ?? 0}
              hint="Live and visible"
              icon={<CheckCircle2 aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Draft Tours"
              value={stats.data?.draft ?? 0}
              hint="Not published yet"
              icon={<FileText aria-hidden />}
              tone="warning"
            />
            <StatCard
              label="Total Locations"
              value={stats.data?.locations ?? 0}
              hint="Cities & destinations"
              icon={<MapPin aria-hidden />}
              tone="info"
            />
          </>
        )}
      </section>

      <ToursTable locations={(locations.data ?? []).map((entry) => entry.name)} />

      <AddLocationDialog open={addingLocation} onOpenChange={setAddingLocation} />
    </>
  );
}
