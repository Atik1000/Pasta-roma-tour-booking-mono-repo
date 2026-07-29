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
    slots: { '2024-05-25': [] },
    meetingPointTitle: '',
    meetingPointAddress: '',
    published: false,
  };
}

/** Stands in for `GET /admin/tours/:id` until Phase 9. */
export function loadTour(id: string): TourEditorValue {
  return {
    id,
    title: 'Rome Colosseum Underground Tour',
    durationHours: '2.5',
    location: 'Rome, Italy',
    type: 'WALKING',
    description:
      'Explore the Colosseum like never before with exclusive access to the underground chambers where gladiators once prepared for battle. Walk through ancient history and experience Rome’s iconic landmark from a unique perspective.',
    priceUsd: '90.00',
    priceEur: '54.00',
    maxTicketsPerTour: '10',
    highlights: [
      'Exclusive underground access',
      'Ancient gladiator chambers',
      'Expert local guide',
      'Panoramic Colosseum views',
    ],
    included: [
      'Entrance tickets',
      'Licensed tour guide',
      'Headsets for groups',
      'All taxes and fees',
    ],
    goodToKnow: [
      'Wear comfortable shoes',
      'Bring a valid ID',
      'Not suitable for wheelchairs',
      'Arrive 15 minutes early',
    ],
    gallery: ['arena', 'underground', 'sunset', 'arches'],
    plans: [
      {
        title: 'Colosseum Introduction',
        description:
          "Meet your guide and get an introduction to the Colosseum's history and significance.",
      },
      {
        title: 'Underground Exploration',
        description: 'Descend into the underground chambers and explore the hidden passages.',
      },
      {
        title: 'Arena Floor & Panoramic View',
        description:
          'Walk on the arena floor and enjoy stunning panoramic views over ancient Rome.',
      },
    ],
    slots: {
      '2024-05-25': [
        { time: '09:00', capacity: 20 },
        { time: '12:00', capacity: 18 },
        { time: '15:00', capacity: 15 },
        { time: '18:00', capacity: 10 },
      ],
    },
    meetingPointTitle: 'Colosseo Metro Station',
    meetingPointAddress: 'Piazza del Colosseo, 1, 00184 Roma RM, Italy',
    published: true,
    createdAt: '2024-05-20T09:00:00.000Z',
    updatedAt: '2024-05-22T10:30:00.000Z',
  };
}
