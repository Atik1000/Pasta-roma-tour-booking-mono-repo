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

import { PaymentsService } from './payments.service';
import { RefundDto } from './refund.dto';
import { stripeProvider } from './stripe.provider';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Starts card payment for a booking that already exists.
   *
   * Public because checkout is open to guests, and rate-limited because the
   * booking reference is the only thing identifying the caller: a reference is
   * not a secret, so this must not be a free channel for probing Stripe.
   */
  @Post('checkout/:reference/payment-intent')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create or reuse the Stripe PaymentIntent for a booking' })
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
   * Excluded from Swagger and exempt from throttling: Stripe decides the rate,
   * and a throttled webhook would be retried until it succeeded anyway. The
   * raw body is required because the signature covers the exact bytes sent;
   * a re-serialised JSON object would not verify.
   */
  @Post('payments/webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.payments.handleWebhook(request.rawBody ?? Buffer.alloc(0), signature);
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
  providers: [stripeProvider, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
