import type { TourEditorValue } from '@/components/tours/tour-editor';

/** The shape a brand-new tour starts from. */
export function emptyTour(): TourEditorValue {
  return {
    title: '',
    durationHours: '2',
    location: '',
    type: 'WALKING',
    description: '',
    priceUsd: '',
    priceEur: '',
    maxTicketsPerTour: '10',
    highlights: [''],
    included: [''],
    goodToKnow: [''],
    gallery: [],
    plans: [{ title: '', description: '' }],
    meetingPointTitle: '',
    meetingPointAddress: '',
    published: false,
  };
}
