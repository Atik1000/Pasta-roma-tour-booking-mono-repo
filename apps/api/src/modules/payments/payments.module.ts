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

import { PaymentLedgerService } from './payment-ledger.service';
import { PaymentsService } from './payments.service';
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
    PaymentLedgerService,
    StripePaymentsService,
    RevolutPaymentsService,
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
