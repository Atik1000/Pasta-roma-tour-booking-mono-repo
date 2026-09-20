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
 * `CASH` and `PAY_LATER` settle away from the platform, so both confirm the
 * booking and commit its seats immediately — they differ only in where the
 * money is taken. `PAYPAL` is the one that is actually collected here, so it
 * alone leaves the booking pending until PayPal says the money moved.
 *
 * Everything in this list is *accepted*; `GET /checkout/payment-methods` is
 * what says which are currently *offered*. The two differ because a gateway
 * with no credentials must not be advertised: `CARD` was once on this list and
 * produced bookings that dead-ended on an unconfigured payment screen and were
 * swept away half an hour later. Add `CARD` back the day `STRIPE_SECRET_KEY` is
 * set; the Stripe endpoints and webhook are still in place and still work.
 */
export const CHECKOUT_PAYMENT_METHODS = ['PAYPAL', 'CASH', 'PAY_LATER'] as const;
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
   * Only the methods a traveller can actually pick. The other values of
   * `PaymentMethod` describe how staff recorded a payment after the fact and
   * must not be selectable here.
   */
  @ApiPropertyOptional({
    enum: CHECKOUT_PAYMENT_METHODS,
    default: 'CASH',
    description:
      'PAYPAL is collected online and leaves the booking pending until it is captured. CASH settles at the meeting point and PAY_LATER before the tour by arrangement; both confirm the seats immediately.',
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
  @ApiProperty({
    description:
      'Whether this booking still owes an online payment. True only for PAYPAL, and it is what sends the browser to the payment page instead of straight to the confirmation.',
  })
  requiresPayment!: boolean;
}

export class CheckoutPaymentMethodsDto {
  @ApiProperty({
    enum: CHECKOUT_PAYMENT_METHODS,
    isArray: true,
    description:
      'The methods this deployment is currently offering. An online gateway appears only once it is configured, so the browser never offers a payment screen that cannot take money.',
  })
  methods!: CheckoutPaymentMethod[];
}
