import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * The payment methods a traveller may choose at checkout.
 *
 * Both settle away from the platform, so both confirm the booking and commit
 * its seats immediately — they differ only in where the money is taken. `CARD`
 * is deliberately absent: nothing here can capture a card until Stripe is
 * configured, and offering it produced bookings that dead-ended on an
 * unconfigured payment screen and were swept away half an hour later. Add it
 * back to this list the day `STRIPE_SECRET_KEY` is set; the Stripe endpoints
 * and webhook are still in place and still work.
 */
export const CHECKOUT_PAYMENT_METHODS = ['CASH', 'PAY_LATER'] as const;
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

export class TicketHolderDto {
  @ApiProperty({ example: 'James' })
  @IsString()
  @MinLength(1, { message: 'Enter a first name.' })
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @MinLength(1, { message: 'Enter a last name.' })
  @MaxLength(80)
  lastName!: string;
}

export class CheckoutDto {
  @ApiProperty({ example: 'John Michael Smith' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name.' })
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ type: [TicketHolderDto], description: 'One entry per ticket, in cart order.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TicketHolderDto)
  ticketHolders!: TicketHolderDto[];

  /**
   * Only the two methods a traveller can actually pick. The other values of
   * `PaymentMethod` describe how staff recorded a payment after the fact and
   * must not be selectable here.
   */
  @ApiPropertyOptional({
    enum: CHECKOUT_PAYMENT_METHODS,
    default: 'CASH',
    description:
      'CASH settles at the meeting point; PAY_LATER settles before the tour by arrangement. Both confirm the seats immediately.',
  })
  @IsOptional()
  @IsIn(CHECKOUT_PAYMENT_METHODS)
  paymentMethod?: CheckoutPaymentMethod;
}

export class CheckoutResultDto {
  @ApiProperty({ example: 'BK-2024-0521' }) reference!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() totalMinor!: number;
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
  @ApiProperty({ example: 'PENDING' }) status!: string;
  @ApiProperty({
    enum: CHECKOUT_PAYMENT_METHODS,
    description: 'How the booking is being paid — the browser routes on this.',
  })
  paymentMethod!: CheckoutPaymentMethod;
  @ApiPropertyOptional({ nullable: true, description: 'Stripe PaymentIntent client secret.' })
  paymentIntentClientSecret!: string | null;
}
