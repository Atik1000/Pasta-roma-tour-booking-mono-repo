import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public, Roles } from '../../common/decorators/auth.decorators';
import { DocumentsModule } from '../documents/documents.module';

import { CapturePayPalOrderDto } from './capture-paypal-order.dto';
import { PaymentLedgerService } from './payment-ledger.service';
import { PaymentsService } from './payments.service';
import { PayPalClient } from './paypal/paypal.client';
import { PayPalPaymentsService } from './paypal/paypal-payments.service';
import { RefundDto } from './refund.dto';
import { RevolutClient } from './revolut/revolut.client';
import { RevolutPaymentsService } from './revolut/revolut-payments.service';
import { StripePaymentsService } from './stripe/stripe-payments.service';
import { stripeProvider } from './stripe/stripe.provider';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripePaymentsService,
    private readonly revolut: RevolutPaymentsService,
    private readonly paypal: PayPalPaymentsService,
  ) {}

  /**
   * Starts card payment for a booking that already exists.
   *
   * Public because checkout is open to guests, and rate-limited because the
   * booking reference is the only thing identifying the caller: a reference is
   * not a secret, so this must not be a free channel for probing the gateway.
   */
  @Post('checkout/:reference/payment-intent')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create or reuse the card payment for a booking' })
  createIntent(@Param('reference') reference: string) {
    return this.payments.createIntent(reference);
  }

  /**
   * Whether a booking has been paid yet. The confirmation page polls this
   * because the webhook, not the browser, is what confirms a booking.
   */
  @Get('checkout/:reference/status')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Payment status for a booking reference' })
  status(@Param('reference') reference: string) {
    return this.payments.publicStatus(reference);
  }

  /**
   * Takes the money for a PayPal order the buyer has just approved.
   *
   * The browser asks for this; it does not assert anything by asking. The
   * server checks the order is the one it opened for this booking, calls
   * PayPal's capture endpoint itself, and believes only what comes back — so
   * this is not the "browser says it paid" shortcut the webhook rules exist to
   * rule out. See the note on `PayPalPaymentsService`.
   *
   * Public and rate-limited for the same reason the intent route is: a booking
   * reference is not a secret, so this must not be a free channel for probing
   * the gateway.
   */
  @Post('checkout/:reference/paypal/capture')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Capture the PayPal order approved for a booking' })
  capturePayPal(@Param('reference') reference: string, @Body() dto: CapturePayPalOrderDto) {
    return this.paypal.capture(reference, dto.orderId);
  }

  /**
   * Stripe's callback. This — not the browser redirect — is what marks a
   * booking paid.
   *
   * Excluded from Swagger and exempt from throttling: the gateway decides the
   * rate, and a throttled webhook would be retried until it succeeded anyway.
   * The raw body is required because the signature covers the exact bytes sent;
   * a re-serialised JSON object would not verify.
   *
   * Kept at the original path so an existing Stripe dashboard configuration
   * does not have to be touched when Revolut is switched on beside it.
   */
  @Post('payments/webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  stripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.stripe.handleWebhook(request.rawBody ?? Buffer.alloc(0), signature);
  }

  /**
   * Revolut's callback, on its own path.
   *
   * Separate from Stripe's rather than sniffed apart by header: the signature
   * scheme *is* the authentication, and a single endpoint that guesses which
   * one to apply is one bad guess away from accepting an unsigned payload.
   *
   * Register this URL against the `ORDER_COMPLETED`, `ORDER_AUTHORISED`,
   * `ORDER_PAYMENT_FAILED`, `ORDER_PAYMENT_DECLINED`, `ORDER_CANCELLED` and
   * `REFUND_COMPLETED` events.
   */
  @Post('payments/webhook/revolut')
  @Public()
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  revolutWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('revolut-signature') signature?: string,
    @Headers('revolut-request-timestamp') timestamp?: string,
  ) {
    return this.revolut.handleWebhook(request.rawBody ?? Buffer.alloc(0), signature, timestamp);
  }

  /**
   * PayPal's callback, on its own path.
   *
   * Register this URL in the PayPal developer dashboard under
   * Apps & Credentials → your app → Webhooks, subscribed to
   * `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`,
   * `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`,
   * `PAYMENT.CAPTURE.REVERSED` and `PAYMENT.CAPTURE.REFUNDED`. Sandbox and live
   * are separate registrations with separate ids; put the one PayPal shows into
   * `PAYPAL_WEBHOOK_ID`, or every event is refused.
   *
   * Whole headers rather than five parameters: all five are signed together and
   * are verified as a set, so splitting them here would only be an opportunity
   * to forward four of them.
   *
   * The raw body is required because the signature covers the exact bytes sent;
   * a re-serialised JSON object would not verify.
   */
  @Post('payments/webhook/paypal')
  @Public()
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  paypalWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paypal.handleWebhook(request.rawBody ?? Buffer.alloc(0), headers);
  }
}

@ApiTags('Payments')
@ApiBearerAuth('access-token')
@Controller('admin/payments')
@Roles('ADMIN')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Refunds are ADMIN-only: an editor manages content, not money. */
  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a captured payment, in full or in part' })
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto) {
    return this.payments.refund(id, dto.amountMinor);
  }
}

@Module({
  imports: [DocumentsModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    stripeProvider,
    RevolutClient,
    PayPalClient,
    PaymentLedgerService,
    StripePaymentsService,
    RevolutPaymentsService,
    PayPalPaymentsService,
    PaymentsService,
  ],
  exports: [PaymentsService, PayPalClient],
})
export class PaymentsModule {}
