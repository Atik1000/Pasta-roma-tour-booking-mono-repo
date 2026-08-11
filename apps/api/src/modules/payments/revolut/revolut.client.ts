import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { revolutConfig } from '../../../config/configuration';

/**
 * The Revolut Merchant API, as much of it as this application needs.
 *
 * Hand-rolled over `fetch` rather than an SDK: Revolut publishes a browser
 * widget (`@revolut/checkout`) but no official server library, and the three
 * calls used here — create an order, read an order back, refund one — are a
 * dozen lines each. A community SDK would be another dependency in the payment
 * path with no maintainer promise behind it.
 *
 * Reference: https://developer.revolut.com/docs/merchant/merchant-api
 */

/**
 * Pinned, exactly as the Stripe client is.
 *
 * Revolut versions its API by date and changes shapes between versions — the
 * public order identifier became `token` in this one. Leaving it unset means
 * the account default applies, and Revolut could change this application's
 * behaviour with no deploy on our side.
 */
export const REVOLUT_API_VERSION = '2024-09-01';

/** The states an order can be in. Only `completed` means money was taken. */
export type RevolutOrderState =
  'pending' | 'processing' | 'authorised' | 'completed' | 'cancelled' | 'failed';

export interface RevolutOrder {
  /** The private id. Stored, and used for every server-side call. */
  id: string;
  /** The public id handed to the browser widget. Never a substitute for `id`. */
  token?: string;
  state: RevolutOrderState;
  amount: number;
  currency: string;
  /** Present on refund orders: the order this one reverses. */
  related_order_id?: string;
  checkout_url?: string;
}

export interface CreateRevolutOrderInput {
  /** Minor units, as everything in this codebase is. */
  amount: number;
  currency: string;
  description: string;
  /** Our own reference, so a Revolut dashboard row can be traced back here. */
  merchantOrderReference: string;
  customer?: { email?: string; full_name?: string };
}

@Injectable()
export class RevolutClient {
  private readonly logger = new Logger(RevolutClient.name);

  constructor(
    @Inject(revolutConfig.KEY) private readonly config: ConfigType<typeof revolutConfig>,
  ) {
    if (!config.secretKey) {
      this.logger.warn('REVOLUT_SECRET_KEY is not set — Revolut endpoints will answer 503.');
    } else if (config.webhookSecrets.length === 0) {
      // Without this, signatures cannot be verified, and an unverified webhook
      // is an unauthenticated endpoint that marks bookings as paid.
      this.logger.warn('REVOLUT_WEBHOOK_SECRET is not set — the webhook will reject every event.');
    }
  }

  get isEnabled(): boolean {
    return Boolean(this.config.secretKey);
  }

  private secret(): string {
    if (!this.config.secretKey) {
      throw new ServiceUnavailableException(
        'Card payment is not configured on this environment yet.',
      );
    }
    return this.config.secretKey;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secret()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Revolut-Api-Version': REVOLUT_API_VERSION,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      // Logged, not returned: Revolut's message can name the merchant account
      // and is written for us, not for the traveller looking at the page.
      this.logger.error(`Revolut ${method} ${path} failed (${response.status}): ${text}`);
      throw new RevolutApiError(response.status, text);
    }

    return (text ? JSON.parse(text) : {}) as T;
  }

  /** https://developer.revolut.com/docs/merchant/create-order */
  createOrder(input: CreateRevolutOrderInput): Promise<RevolutOrder> {
    return this.request<RevolutOrder>('POST', '/api/orders', {
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      // Automatic: the seats are committed the moment the booking is made, so
      // there is nothing to authorise now and capture later.
      capture_mode: 'automatic',
      merchant_order_data: { reference: input.merchantOrderReference },
      ...(input.customer ? { customer: input.customer } : {}),
    });
  }

  /** https://developer.revolut.com/docs/merchant/retrieve-order */
  retrieveOrder(id: string): Promise<RevolutOrder> {
    return this.request<RevolutOrder>('GET', `/api/orders/${encodeURIComponent(id)}`);
  }

  /**
   * https://developer.revolut.com/docs/merchant/update-order
   *
   * Used when a booking was edited after its order was opened. Repricing the
   * existing order rather than opening a second one matters: a traveller who
   * left the widget open would otherwise pay the stale amount into an order
   * this application had stopped listening for.
   */
  updateOrder(id: string, amount: number, currency: string): Promise<RevolutOrder> {
    return this.request<RevolutOrder>('PATCH', `/api/orders/${encodeURIComponent(id)}`, {
      amount,
      currency,
    });
  }

  /**
   * https://developer.revolut.com/docs/merchant/refund-an-order
   *
   * Returns a *new* order of type refund, whose `related_order_id` points back
   * at the original. Only a completed order can be refunded.
   */
  refundOrder(id: string, amount: number, currency: string): Promise<RevolutOrder> {
    return this.request<RevolutOrder>('POST', `/api/orders/${encodeURIComponent(id)}/refund`, {
      amount,
      currency,
    });
  }
}

/** A non-2xx from Revolut, carried so the caller can decide what to surface. */
export class RevolutApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Revolut responded ${status}`);
    this.name = 'RevolutApiError';
  }
}
