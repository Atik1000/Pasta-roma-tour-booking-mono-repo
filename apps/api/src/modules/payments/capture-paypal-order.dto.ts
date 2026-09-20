import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CapturePayPalOrderDto {
  @ApiProperty({
    description: 'The PayPal order the buyer approved. Must be the one opened for this booking.',
    example: '5O190127TN364715T',
  })
  @IsString()
  @MaxLength(64)
  // PayPal order ids are uppercase alphanumeric. Constrained here so nothing
  // shaped like a path or a query string ever reaches a URL this server builds.
  @Matches(/^[A-Za-z0-9]+$/, { message: 'That is not a PayPal order id.' })
  orderId!: string;
}
