import type { BlogStatus, BookingStatus, PaymentStatus, TourStatus } from '@pasta/types';
import { humanizeEnum } from '@pasta/utils';

import { Badge, type BadgeProps } from './badge';

type AnyStatus = BookingStatus | PaymentStatus | TourStatus | BlogStatus;

/**
 * Status → colour, in one place.
 *
 * Every screen that shows a status reads from this map, so a booking marked
 * "Refunded" is the same blue in the table, the detail page and the dashboard.
 */
const TONES: Record<AnyStatus, NonNullable<BadgeProps['tone']>> = {
  CONFIRMED: 'success',
  PAID: 'success',
  PUBLISHED: 'success',
  PENDING: 'warning',
  DRAFT: 'warning',
  CANCELLED: 'danger',
  FAILED: 'danger',
  REFUNDED: 'info',
};

export interface StatusPillProps extends Omit<BadgeProps, 'tone' | 'children'> {
  status: AnyStatus;
  /** Overrides the derived label, e.g. "Payment Pending" for a payment status. */
  label?: string;
}

export function StatusPill({ status, label, ...props }: StatusPillProps) {
  return (
    <Badge tone={TONES[status] ?? 'neutral'} {...props}>
      {label ?? humanizeEnum(status)}
    </Badge>
  );
}
