import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const TOUR_STATUSES = ['ALL', 'PUBLISHED', 'DRAFT'] as const;
const BOOKING_STATUSES = ['ALL', 'CONFIRMED', 'PENDING', 'CANCELLED'] as const;
const PAYMENT_STATUSES = ['ALL', 'PAID', 'PENDING', 'REFUNDED', 'FAILED'] as const;

export class ListAdminToursQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TOUR_STATUSES })
  @IsOptional()
  @IsIn(TOUR_STATUSES)
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;
}

export class ListAdminBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BOOKING_STATUSES })
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: 'ALL' | 'CONFIRMED' | 'PENDING' | 'CANCELLED';

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  paymentStatus?: 'ALL' | 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';
}

export class ListAdminBlogsQueryDto extends PaginationQueryDto {
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
  @ApiProperty() durationHours!: number;
  @ApiProperty() priceUsdMinor!: number;
  @ApiProperty() priceEurMinor!: number;
  @ApiProperty({ enum: ['PUBLISHED', 'DRAFT'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
  @ApiProperty() updatedAt!: string;
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
  @ApiProperty() title!: string;
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
    method: string;
    status: string;
    transactionId: string | null;
    amountMinor: number;
    paidAt: string | null;
  } | null;
  @ApiProperty() notes!: { id: string; body: string; createdAt: string }[];
}

export class AdminBlogDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() excerpt!: string;
  @ApiProperty({ type: [String] }) categories!: string[];
  @ApiProperty({ enum: ['PUBLISHED', 'DRAFT'] }) status!: string;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiProperty() updatedAt!: string;
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
