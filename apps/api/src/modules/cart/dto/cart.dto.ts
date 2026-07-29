import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

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
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
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
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
}
