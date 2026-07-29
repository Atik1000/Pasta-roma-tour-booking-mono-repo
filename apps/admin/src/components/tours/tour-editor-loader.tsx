'use client';

import { ErrorState, Skeleton } from '@pasta/ui';
import type { AdminTourDetail } from '@pasta/api-client';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '@/lib/session';
import { emptyTour } from '@/lib/tour-defaults';

import { TourEditor, type TourEditorValue } from './tour-editor';

/** The API speaks minor units and enum values; the form edits strings. */
function toEditorValue(tour: AdminTourDetail): TourEditorValue {
  return {
    id: tour.id,
    title: tour.title,
    durationHours: String(tour.durationHours),
    location: tour.location,
    type: tour.type,
    description: tour.description,
    priceUsd: (tour.priceUsdMinor / 100).toFixed(2),
    priceEur: (tour.priceEurMinor / 100).toFixed(2),
    maxTicketsPerTour: String(tour.maxTicketsPerTour),
    // An empty list still needs one row, or there is nothing to type into.
    highlights: tour.highlights.length ? tour.highlights : [''],
    included: tour.included.length ? tour.included : [''],
    goodToKnow: tour.goodToKnow.length ? tour.goodToKnow : [''],
    gallery: tour.gallery,
    plans: tour.plans.length ? tour.plans : [{ title: '', description: '' }],
    meetingPointTitle: tour.meetingPointTitle ?? '',
    meetingPointAddress: tour.meetingPointAddress ?? '',
    published: tour.published,
    createdAt: tour.createdAt,
    updatedAt: tour.updatedAt,
  };
}

function useLocationNames() {
  const query = useQuery({
    queryKey: ['locations'],
    queryFn: () => adminApi.admin.locations(),
  });

  return (query.data ?? []).map((entry) => entry.name);
}

export function NewTourEditor() {
  const locations = useLocationNames();

  return <TourEditor mode="create" initialValue={emptyTour()} locations={locations} />;
}

export function EditTourEditor({ id }: { id: string }) {
  const locations = useLocationNames();

  const tour = useQuery({
    queryKey: ['admin', 'tours', id],
    queryFn: () => adminApi.admin.tour(id),
  });

  if (tour.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      </div>
    );
  }

  if (tour.isError || !tour.data) {
    return <ErrorState title="That tour could not be loaded" onRetry={() => void tour.refetch()} />;
  }

  return (
    <TourEditor
      mode="edit"
      // Remounts when a different tour is opened, so the form never shows the
      // previous tour's unsaved edits.
      key={tour.data.id}
      initialValue={toEditorValue(tour.data)}
      locations={locations}
    />
  );
}
