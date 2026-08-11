import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const TOUR_STATUSES = ['ALL', 'PUBLISHED', 'DRAFT'] as const;
const BOOKING_STATUSES = ['ALL', 'CONFIRMED', 'PENDING', 'CANCELLED'] as const;
const PAYMENT_STATUSES = ['ALL', 'PAID', 'PENDING', 'REFUNDED', 'FAILED'] as const;
const PAYMENT_METHODS = ['ALL', 'CASH', 'PAY_LATER', 'CARD', 'PAYPAL', 'APPLE_PAY'] as const;

/**
 * The advanced-filter fields the listing screens share.
 *
 * `from`/`to` are calendar dates rather than timestamps — the operator picks
 * days, and each list decides which of its own columns the range applies to.
 */
class DateRangeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start date, YYYY-MM-DD.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date, YYYY-MM-DD.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ListAdminToursQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: TOUR_STATUSES })
  @IsOptional()
  @IsIn(TOUR_STATUSES)
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ description: 'Country name, exactly as stored on the location.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ description: 'Lowest adult price in minor units.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceMinor?: number;

  @ApiPropertyOptional({ description: 'Highest adult price in minor units.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceMinor?: number;
}

export class ListAdminBookingsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: BOOKING_STATUSES })
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: 'ALL' | 'CONFIRMED' | 'PENDING' | 'CANCELLED';

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  paymentStatus?: 'ALL' | 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';

  @ApiPropertyOptional({ description: 'Tour id — only bookings containing this tour.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tourId?: string;

  @ApiPropertyOptional({ description: 'Lowest booking total in minor units.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minAmountMinor?: number;

  @ApiPropertyOptional({ description: 'Highest booking total in minor units.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAmountMinor?: number;
}

export class ListAdminBlogsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', 'PUBLISHED', 'DRAFT'] })
  @IsOptional()
  @IsIn(['ALL', 'PUBLISHED', 'DRAFT'])
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;
}

export class ListAdminPaymentsQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: 'ALL' | 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';

  // Derived from the list the validator checks, rather than spelled out again:
  // the two had already drifted apart, and this one was missing CASH.
  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: (typeof PAYMENT_METHODS)[number];
}

/** The dashboard's date-range control narrows every figure on the screen. */
export class DashboardRangeQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start date, YYYY-MM-DD.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date, YYYY-MM-DD.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class DashboardStatsDto {
  @ApiProperty() totalBookings!: number;
  @ApiProperty() totalRevenueMinor!: number;
  @ApiProperty() totalCustomers!: number;
  @ApiProperty() activeTours!: number;
  @ApiProperty() pendingPayments!: number;
}

export class AdminTourDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() location!: string;
  @ApiProperty({ description: "The location's country." }) country!: string;
  @ApiProperty() durationHours!: number;
  @ApiProperty() priceUsdMinor!: number;
  @ApiProperty() priceEurMinor!: number;
  @ApiProperty({ enum: ['PUBLISHED', 'DRAFT'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
  /// Departures from today onwards. Zero means the tour cannot be booked,
  /// whatever its status says.
  @ApiProperty() upcomingDepartures!: number;
  @ApiProperty() updatedAt!: string;
}

export class TourSlotSummaryDto {
  @ApiProperty({ description: 'Departures from today onwards.' }) upcoming!: number;
  @ApiPropertyOptional({ nullable: true }) nextDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) nextTime!: string | null;
}

export class AdminBookingDto {
  @ApiProperty() reference!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() customerEmail!: string;
  @ApiProperty({ type: [String] }) tours!: string[];
  @ApiProperty() tickets!: number;
  @ApiProperty() totalMinor!: number;
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() status!: string;
  @ApiProperty() bookedAt!: string;
}

export class AdminBookingItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() tourId!: string;
  @ApiProperty() title!: string;
  /// The tour's current location and cover photo, so the row is recognisable at
  /// a glance. Both are presentational — the money and title stay denormalised.
  @ApiProperty() location!: string;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
  @ApiProperty() date!: string;
  @ApiProperty() time!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPriceMinor!: number;
  @ApiProperty() amountMinor!: number;
  @ApiProperty({ type: [String] }) holders!: string[];
}

export class AdminBookingDetailDto {
  @ApiProperty() reference!: string;
  @ApiProperty() status!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() bookedAt!: string;
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
  @ApiProperty() subtotalMinor!: number;
  @ApiProperty() bookingFeeMinor!: number;
  @ApiProperty() totalMinor!: number;
  @ApiProperty() customer!: { fullName: string; email: string };
  @ApiProperty({ type: [AdminBookingItemDto] }) items!: AdminBookingItemDto[];
  @ApiPropertyOptional({ nullable: true })
  payment!: {
    id: string;
    method: string;
    status: string;
    transactionId: string | null;
    amountMinor: number;
    paidAt: string | null;
    /**
     * False when the payment came from Stripe. The record then belongs to the
     * processor, and the admin screen shows it read-only — an operator typing a
     * different captured amount would make every invoice, export and revenue
     * figure disagree with the money that actually moved.
     */
    isManual: boolean;
  } | null;
  @ApiProperty() notes!: { id: string; body: string; createdAt: string }[];
}

export class AdminBlogDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() excerpt!: string;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
  @ApiProperty({ type: [String] }) categories!: string[];
  @ApiProperty({ enum: ['PUBLISHED', 'DRAFT'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiProperty() updatedAt!: string;
}

export class TopTourDto {
  @ApiPropertyOptional({ nullable: true }) id!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty() bookings!: number;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
}

export class AdminPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingReference!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() method!: string;
  @ApiPropertyOptional({ nullable: true }) transactionId!: string | null;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() refundedMinor!: number;
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) paidAt!: string | null;
}
