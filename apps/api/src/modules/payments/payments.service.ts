import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { paymentsConfig } from '../../config/configuration';

import type { PaymentIntentResult } from './payment-intent.types';
import { PaymentLedgerService } from './payment-ledger.service';
import { RevolutPaymentsService } from './revolut/revolut-payments.service';
import { StripePaymentsService } from './stripe/stripe-payments.service';

/**
 * Which gateway handles what.
 *
 * Two rules, and they are deliberately different:
 *
 *  • A **new** payment goes to the configured provider. That is a deployment
 *    decision, `PAYMENT_PROVIDER`, and it applies from the moment it changes.
 *
 *  • An **existing** payment stays with the gateway that holds the money. A
 *    refund is routed by the payment's own `provider` column, never by
 *    configuration — switching providers on Monday must not make Sunday's
 *    takings unrefundable, and asking Revolut to refund a Stripe charge is not
 *    a graceful failure, it is a 404 in front of a customer owed money.
 *
 * Webhooks are not routed at all: each gateway has its own endpoint, because
 * each signs its callbacks differently and the signature is the authentication.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly ledger: PaymentLedgerService,
    private readonly stripe: StripePaymentsService,
    private readonly revolut: RevolutPaymentsService,
    @Inject(paymentsConfig.KEY) private readonly config: ConfigType<typeof paymentsConfig>,
  ) {}

  /** Starts a card payment with whichever gateway this deployment is using. */
  createIntent(reference: string): Promise<PaymentIntentResult> {
    return this.config.provider === 'stripe'
      ? this.stripe.createIntent(reference)
      : this.revolut.createIntent(reference);
  }

  /** Provider-agnostic: it reads this application's own record, not a gateway. */
  publicStatus(reference: string) {
    return this.ledger.publicStatus(reference);
  }

  /**
   * Routed by the payment's own provider — see the note on this class.
   *
   * Only the provider is read here. Whether the payment may actually be
   * refunded is the chosen gateway's own first question, asked after it has
   * checked it is configured at all, so an environment with no credentials
   * still answers "not configured" rather than a verdict about the payment.
   */
  async refund(paymentId: string, amountMinor?: number): Promise<{ message: string }> {
    const provider = await this.ledger.providerFor(paymentId);

    return provider === 'REVOLUT'
      ? this.revolut.refund(paymentId, amountMinor)
      : this.stripe.refund(paymentId, amountMinor);
  }
}
