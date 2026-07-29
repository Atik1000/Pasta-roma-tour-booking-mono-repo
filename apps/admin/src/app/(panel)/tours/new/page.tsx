import type { Metadata } from 'next';

import { LOCATION_NAMES } from '@/lib/constants';
import { TourEditor } from '@/components/tours/tour-editor';

import { emptyTour } from '@/lib/tour-defaults';

export const metadata: Metadata = { title: 'New tour' };

export default function NewTourPage() {
  return <TourEditor mode="create" initialValue={emptyTour()} locations={LOCATION_NAMES} />;
}
