import type { Metadata } from 'next';

import { LOCATION_NAMES } from '@/lib/constants';
import { TourEditor } from '@/components/tours/tour-editor';

import { loadTour } from '@/lib/tour-defaults';

export const metadata: Metadata = { title: 'Edit tour' };

type Params = Promise<{ id: string }>;

export default async function EditTourPage({ params }: { params: Params }) {
  const { id } = await params;

  return <TourEditor mode="edit" initialValue={loadTour(id)} locations={LOCATION_NAMES} />;
}
