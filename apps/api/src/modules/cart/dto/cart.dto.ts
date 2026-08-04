import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrencyCode } from '@pasta/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { CURRENCY_CODES } from '../../../common/dto/currency-query.dto';

export class AddCartItemDto {
  @ApiProperty({ description: 'Tour slug.' })
  @IsString()
  slug!: string;

  @ApiProperty({ description: 'Departure slot id.' })
  @IsUUID()
  slotId!: string;

  @ApiProperty({ minimum: 1, maximum: 50, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  @ApiPropertyOptional({
    enum: CURRENCY_CODES,
    default: CurrencyCode.EUR,
    description: 'Currency the visitor is browsing in. Re-prices the whole basket.',
  })
  @IsOptional()
  @IsIn(CURRENCY_CODES)
  currency?: CurrencyCode;
}

export class SetCartCurrencyDto {
  @ApiProperty({ enum: CURRENCY_CODES })
  @IsIn(CURRENCY_CODES)
  currency!: CurrencyCode;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;
}

export class CartItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() tourSlug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() location!: string;
  @ApiProperty({ example: '2024-05-25' }) date!: string;
  @ApiProperty({ example: '10:00' }) time!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'Adult price in minor units.' }) unitPriceMinor!: number;
  @ApiProperty() amountMinor!: number;
  @ApiProperty({ enum: CURRENCY_CODES }) currency!: CurrencyCode;
  @ApiPropertyOptional({ nullable: true, description: "The tour's cover photo." })
  coverImage!: string | null;
  @ApiProperty({ description: 'Seats still available on this slot.' }) remaining!: number;
  @ApiProperty({ description: 'Per-booking ticket cap for this tour.' }) maxTickets!: number;
  @ApiProperty({ description: 'True when the catalogue price changed since adding.' })
  priceChanged!: boolean;
}

export class CartDto {
  @ApiProperty({ type: [CartItemDto] }) items!: CartItemDto[];
  @ApiProperty() totalTickets!: number;
  @ApiProperty() subtotalMinor!: number;
  @ApiProperty() bookingFeeMinor!: number;
  @ApiProperty() totalMinor!: number;
  @ApiProperty({ enum: CURRENCY_CODES }) currency!: CurrencyCode;
}
