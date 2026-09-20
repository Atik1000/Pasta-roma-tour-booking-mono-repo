import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  // For `PayPalClient` alone — checkout needs to know whether the gateway is
  // configured before it writes a booking that would wait on one.
  imports: [PaymentsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
