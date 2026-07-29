import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class RefundDto {
  @ApiPropertyOptional({
    description: 'Amount in minor units. Omit to refund everything still refundable.',
    example: 2500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'A refund must be at least one cent.' })
  amountMinor?: number;
}
