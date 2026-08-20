/**
 * Domain enumerations.
 *
 * Declared as const objects rather than TypeScript `enum`s so the values are
 * plain strings at runtime — identical on the wire, in Prisma, and in the UI.
 */

export const UserRole = {
  Admin: 'ADMIN',
  Editor: 'EDITOR',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const TourStatus = {
  Draft: 'DRAFT',
  Published: 'PUBLISHED',
} as const;
export type TourStatus = (typeof TourStatus)[keyof typeof TourStatus];

export const TourType = {
  Walking: 'WALKING',
  Bus: 'BUS',
  Museum: 'MUSEUM',
  DayTrip: 'DAY_TRIP',
  Food: 'FOOD',
  Private: 'PRIVATE',
} as const;
export type TourType = (typeof TourType)[keyof typeof TourType];

export const TourBulletKind = {
  Highlight: 'HIGHLIGHT',
  Included: 'INCLUDED',
  GoodToKnow: 'GOOD_TO_KNOW',
} as const;
export type TourBulletKind = (typeof TourBulletKind)[keyof typeof TourBulletKind];

export const BookingStatus = {
  Pending: 'PENDING',
  Confirmed: 'CONFIRMED',
  Cancelled: 'CANCELLED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const PaymentStatus = {
  Pending: 'PENDING',
  Paid: 'PAID',
  Failed: 'FAILED',
  Refunded: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  Card: 'CARD',
  PayPal: 'PAYPAL',
  ApplePay: 'APPLE_PAY',
  /** Settled in person at the meeting point, on the day. */
  Cash: 'CASH',
  /** Reserved now, settled before the tour by an off-platform arrangement. */
  PayLater: 'PAY_LATER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const BlogStatus = {
  Draft: 'DRAFT',
  Published: 'PUBLISHED',
} as const;
export type BlogStatus = (typeof BlogStatus)[keyof typeof BlogStatus];

export const CurrencyCode = {
  EUR: 'EUR',
  USD: 'USD',
} as const;
export type CurrencyCode = (typeof CurrencyCode)[keyof typeof CurrencyCode];

export const TourSortOption = {
  Popular: 'POPULAR',
  PriceAsc: 'PRICE_ASC',
  PriceDesc: 'PRICE_DESC',
  DurationAsc: 'DURATION_ASC',
  Newest: 'NEWEST',
} as const;
export type TourSortOption = (typeof TourSortOption)[keyof typeof TourSortOption];
