import { ConfigType } from '@nestjs/config';
import { Logger, type Provider } from '@nestjs/common';
import Stripe from 'stripe';

import { stripeConfig } from '../../../config/configuration';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/**
 * Pinned rather than floating.
 *
 * Stripe ships breaking changes behind dated API versions; letting the account
 * default apply would mean a change on Stripe's side could alter this
 * application's behaviour with no deploy.
 */
export const STRIPE_API_VERSION = '2025-09-30.clover';

/**
 * The Stripe client, or `null` when no secret key is configured.
 *
 * Null is a supported state, not a failure: the rest of the product — the
 * catalogue, the admin panel, the booking records — must run in development
 * and in CI without payment credentials. Every route that needs Stripe checks
 * for the client and answers 503 rather than throwing at boot.
 */
export const stripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [stripeConfig.KEY],
  useFactory: (config: ConfigType<typeof stripeConfig>): Stripe | null => {
    const logger = new Logger('StripeProvider');

    if (!config.secretKey) {
      logger.warn('STRIPE_SECRET_KEY is not set — payment endpoints will answer 503.');
      return null;
    }

    if (!config.webhookSecret) {
      // Without this, webhook signatures cannot be verified, and an unverified
      // webhook is an unauthenticated endpoint that marks bookings as paid.
      logger.warn('STRIPE_WEBHOOK_SECRET is not set — the webhook will reject every event.');
    }

    return new Stripe(config.secretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      typescript: true,
      // Stripe's own retry, so a blip does not lose a payment intent.
      maxNetworkRetries: 2,
      appInfo: { name: 'Pasta Roma Tour', version: '1.0.0' },
    });
  },
};
