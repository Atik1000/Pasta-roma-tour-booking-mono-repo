import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Machine-readable error codes for rule violations the front-end reacts to.
 * These travel in the `error` field of the API error envelope.
 */
export const BusinessErrorCode = {
  MaxTicketsExceeded: 'MAX_TICKETS_EXCEEDED',
  CartEmpty: 'CART_EMPTY',
  CartExpired: 'CART_EXPIRED',
  PriceChanged: 'PRICE_CHANGED',
  BookingNotCancellable: 'BOOKING_NOT_CANCELLABLE',
  PaymentFailed: 'PAYMENT_FAILED',
  PaymentAlreadyCaptured: 'PAYMENT_ALREADY_CAPTURED',
  RefundNotAllowed: 'REFUND_NOT_ALLOWED',
  SlugTaken: 'SLUG_TAKEN',
  LocationInUse: 'LOCATION_IN_USE',
  DuplicateBookingItem: 'DUPLICATE_BOOKING_ITEM',
  TourNotPublished: 'TOUR_NOT_PUBLISHED',
} as const;
export type BusinessErrorCode = (typeof BusinessErrorCode)[keyof typeof BusinessErrorCode];

/**
 * A violated domain rule, as opposed to a transport or validation failure.
 * Defaults to 409 Conflict — the request was well-formed but the domain
 * refuses it in the current state.
 */
export class BusinessException extends HttpException {
  readonly code: BusinessErrorCode;

  constructor(code: BusinessErrorCode, message: string, status: HttpStatus = HttpStatus.CONFLICT) {
    super({ code, message }, status);
    this.code = code;
  }
}
