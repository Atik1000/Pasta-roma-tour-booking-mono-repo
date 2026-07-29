import type { CalendarDate, CurrencyCode } from '@pasta/types';

/**
 * Data for the flows whose endpoints do not exist yet: cart, checkout and
 * booking lookup. Everything else on the site now reads from the API.
 *
 * These disappear when the cart/checkout/bookings modules land.
 */

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
];

/** Recent searches are per-browser; Phase 10 moves these to local storage. */
export const RECENT_SEARCHES = [
  'Colosseum Tour',
  'Vatican Museum',
  'Rome Bus Tour',
  'Florence Day Trip',
  'Venice Gondola',
];

export const BOOKING_FEE_MINOR = 500;

export interface CartLine {
  id: string;
  slug: string;
  title: string;
  location: string;
  date: CalendarDate;
  time: string;
  quantity: number;
  unitPriceMinor: number;
  currency: CurrencyCode;
}

export function getCart(): CartLine[] {
  return [
    {
      id: 'c1',
      slug: 'colosseum-underground-tour',
      title: 'Rome Colosseum Underground Tour',
      location: 'Rome, Italy',
      date: '2024-05-25',
      time: '10:00',
      quantity: 2,
      unitPriceMinor: 5900,
      currency: 'EUR',
    },
    {
      id: 'c2',
      slug: 'vatican-museums-sistine-chapel',
      title: 'Vatican Museums & Sistine Chapel Tour',
      location: 'Rome, Italy',
      date: '2024-05-26',
      time: '14:00',
      quantity: 2,
      unitPriceMinor: 4000,
      currency: 'EUR',
    },
    {
      id: 'c3',
      slug: 'rome-evening-walking-tour',
      title: 'Rome Ancient City Walking Tour',
      location: 'Rome, Italy',
      date: '2024-05-27',
      time: '11:30',
      quantity: 1,
      unitPriceMinor: 4500,
      currency: 'EUR',
    },
  ];
}

export interface BookingTourLine {
  title: string;
  date: CalendarDate;
  time: string;
  location: string;
  travellers: number;
}

export interface BookingRecord {
  reference: string;
  bookedAt: CalendarDate;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  paymentStatus: 'PAID' | 'PENDING' | 'REFUNDED';
  totalMinor: number;
  currency: CurrencyCode;
  tours: BookingTourLine[];
}

export function getBookingsByEmail(email: string): BookingRecord[] {
  if (!email) return [];

  return [
    {
      reference: 'PRT-2024-1058',
      bookedAt: '2024-05-10',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      totalMinor: 13800,
      currency: 'EUR',
      tours: [
        {
          title: 'Colosseum Underground Tour',
          date: '2024-05-20',
          time: '10:00',
          location: 'Rome, Italy',
          travellers: 2,
        },
        {
          title: 'Vatican Museums & Sistine Chapel Tour',
          date: '2024-05-21',
          time: '09:00',
          location: 'Rome, Italy',
          travellers: 2,
        },
        {
          title: 'Rome Hop-On Hop-Off Bus Tour',
          date: '2024-05-22',
          time: '09:30',
          location: 'Rome, Italy',
          travellers: 2,
        },
      ],
    },
    {
      reference: 'PRT-2024-0987',
      bookedAt: '2024-04-28',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      totalMinor: 8900,
      currency: 'EUR',
      tours: [
        {
          title: 'Vatican Museums & Sistine Chapel Tour',
          date: '2024-05-15',
          time: '09:00',
          location: 'Rome, Italy',
          travellers: 2,
        },
        {
          title: 'Trastevere Food Tour',
          date: '2024-05-15',
          time: '17:00',
          location: 'Rome, Italy',
          travellers: 2,
        },
      ],
    },
    {
      reference: 'PRT-2024-0765',
      bookedAt: '2024-04-10',
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      totalMinor: 6500,
      currency: 'EUR',
      tours: [
        {
          title: 'Trastevere Food Tour',
          date: '2024-04-20',
          time: '17:00',
          location: 'Rome, Italy',
          travellers: 2,
        },
      ],
    },
  ];
}
