import { ServiceUnavailableException } from '@nestjs/common';

import { BusinessException } from '../../../common/exceptions/business.exception';
import type { PrismaService } from '../../../database/prisma.service';
import type { DocumentsService } from '../../documents/documents.service';
import type { MailService } from '../../mail/mail.service';
import { PaymentLedgerService } from '../payment-ledger.service';

import { PayPalPaymentsService } from './paypal-payments.service';
import { PayPalApiError, type PayPalClient, type PayPalOrder } from './paypal.client';

const CONFIG = {
  apiUrl: 'https://api-m.sandbox.paypal.com',
  mode: 'sandbox' as const,
  clientId: 'client_stub',
  clientSecret: 'secret_stub',
  webhookId: 'WH-STUB',
  enabled: true,
};

interface PaymentRow {
  id: string;
  bookingId: string;
  method: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  providerIntentId: string | null;
  transactionId: string | null;
  refundedAmount: number;
  appliedRefundIds: string[];
  booking: { id: string; reference: string; status: string };
}

interface BookingRow {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  currency: string;
  total: number;
  expiresAt: Date | null;
  deletedAt: Date | null;
}

/** An order PayPal reports as captured, for `amount` minor units. */
function completedOrder(amount = 4500, currency = 'EUR', captureId = 'cap_1'): PayPalOrder {
  return {
    id: 'ord_1',
    status: 'COMPLETED',
    purchase_units: [
      {
        amount: { currency_code: currency, value: (amount / 100).toFixed(2) },
        payments: {
          captures: [
            {
              id: captureId,
              status: 'COMPLETED',
              amount: { currency_code: currency, value: (amount / 100).toFixed(2) },
            },
          ],
        },
      },
    ],
  };
}

/**
 * In-memory stand-ins for the tables the service touches, and a stubbed PayPal.
 * The rules under test are this application's — capture only what this booking
 * opened, refuse a mismatched amount, apply a refund once, never take a
 * browser's word for a payment — and none of them need a network round trip to
 * verify.
 */
function makeStubs() {
  const booking: BookingRow = {
    id: 'b1',
    reference: 'BK-1',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    currency: 'EUR',
    total: 4500,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    deletedAt: null,
  };

  const payments: PaymentRow[] = [];
  const notes: { bookingId: string; body: string }[] = [];

  const latest = () => [...payments].reverse().slice(0, 1);

  const prisma = {
    booking: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          ...booking,
          customer: { email: 'a@b.test', fullName: 'Ada' },
          payments: latest(),
        }),
      ),
      update: jest.fn(({ data }: { data: Partial<BookingRow> }) => {
        Object.assign(booking, data);
        return Promise.resolve(booking);
      }),
    },
    payment: {
      findUnique: jest.fn(({ where }: { where: { id?: string; providerIntentId?: string } }) =>
        Promise.resolve(
          payments.find(
            (row) =>
              (where.id && row.id === where.id) ||
              (where.providerIntentId && row.providerIntentId === where.providerIntentId),
          ) ?? null,
        ),
      ),
      findFirst: jest.fn(({ where }: { where: { transactionId?: string } }) =>
        Promise.resolve(payments.find((row) => row.transactionId === where.transactionId) ?? null),
      ),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: Partial<PaymentRow>;
          update: Partial<PaymentRow>;
        }) => {
          const existing = payments.find((row) => row.id === where.id);
          if (existing) {
            Object.assign(existing, update);
            return Promise.resolve(existing);
          }
          const row = {
            id: `p${payments.length + 1}`,
            bookingId: booking.id,
            method: 'PAYPAL',
            provider: 'PAYPAL',
            status: 'PENDING',
            amount: booking.total,
            currency: booking.currency,
            providerIntentId: null,
            transactionId: null,
            refundedAmount: 0,
            appliedRefundIds: [],
            booking: { id: booking.id, reference: booking.reference, status: booking.status },
            ...create,
          } as PaymentRow;
          payments.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<PaymentRow> & { appliedRefundIds?: { push: string } };
        }) => {
          const row = payments.find((entry) => entry.id === where.id);
          if (!row) return Promise.resolve(null);

          const { appliedRefundIds, ...rest } = data;
          Object.assign(row, rest);
          if (appliedRefundIds?.push) row.appliedRefundIds.push(appliedRefundIds.push);

          return Promise.resolve(row);
        },
      ),
    },
    bookingNote: {
      create: jest.fn(({ data }: { data: { bookingId: string; body: string } }) => {
        notes.push(data);
        return Promise.resolve(data);
      }),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const created: PayPalOrder = {
    id: 'ord_1',
    status: 'CREATED',
    purchase_units: [{ amount: { currency_code: 'EUR', value: '45.00' } }],
  };

  const paypal = {
    isEnabled: true,
    clientId: CONFIG.clientId,
    mode: CONFIG.mode,
    webhookId: CONFIG.webhookId,
    createOrder: jest.fn(() => Promise.resolve({ ...created })),
    retrieveOrder: jest.fn(() => Promise.resolve({ ...created })),
    updateOrderAmount: jest.fn(() => Promise.resolve()),
    captureOrder: jest.fn(() => Promise.resolve(completedOrder())),
    refundCapture: jest.fn(() => Promise.resolve({ id: 'ref_1', status: 'COMPLETED' })),
    verifyWebhookSignature: jest.fn(() => Promise.resolve('SUCCESS')),
  };

  const documents = {
    loadBooking: jest.fn(() =>
      Promise.resolve({ reference: 'BK-1', customer: { email: 'a@b.test' } }),
    ),
    confirmationEmail: jest.fn(() => ({ subject: 's', html: 'h', text: 't' })),
    ticketPdf: jest.fn(() => Promise.resolve(Buffer.from('%PDF-'))),
  };

  const mail = { send: jest.fn(() => Promise.resolve()) };

  const ledger = new PaymentLedgerService(
    prisma as unknown as PrismaService,
    documents as unknown as DocumentsService,
    mail as unknown as MailService,
  );

  const service = new PayPalPaymentsService(ledger, paypal as unknown as PayPalClient, CONFIG);

  return { service, ledger, prisma, paypal, documents, mail, booking, payments, notes, created };
}

/** The transmission headers PayPal signs a webhook with. */
const HEADERS = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig-1',
  'paypal-transmission-time': new Date().toISOString(),
};

function event(body: object): Buffer {
  return Buffer.from(JSON.stringify(body));
}

const CAPTURE_COMPLETED = {
  id: 'WH-EVT-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id: 'cap_1',
    status: 'COMPLETED',
    amount: { currency_code: 'EUR', value: '45.00' },
    supplementary_data: { related_ids: { order_id: 'ord_1' } },
  },
};

describe('PayPalPaymentsService', () => {
  describe('when PayPal is not configured', () => {
    it('answers 503 rather than throwing at boot', async () => {
      const { ledger } = makeStubs();
      const service = new PayPalPaymentsService(
        ledger,
        { isEnabled: false } as unknown as PayPalClient,
        { ...CONFIG, clientId: undefined, clientSecret: undefined, enabled: false },
      );

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('createIntent', () => {
    it('opens an order for the booking total and stores its id', async () => {
      const { service, paypal, payments } = makeStubs();

      const result = await service.createIntent('BK-1');

      expect(paypal.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 4500, currency: 'EUR' }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          provider: 'paypal',
          orderId: 'ord_1',
          clientId: 'client_stub',
          environment: 'sandbox',
          amountMinor: 4500,
        }),
      );
      expect(payments[0]?.providerIntentId).toBe('ord_1');
      // A wallet, not a card. An operator reading the booking needs the two
      // told apart.
      expect(payments[0]?.method).toBe('PAYPAL');
    });

    it('reuses an unfinished order instead of stranding a second one', async () => {
      const { service, paypal, payments } = makeStubs();
      await service.createIntent('BK-1');

      await service.createIntent('BK-1');

      expect(paypal.createOrder).toHaveBeenCalledTimes(1);
      expect(payments).toHaveLength(1);
    });

    it('reprices the order when the booking was edited after it was opened', async () => {
      const { service, paypal, booking } = makeStubs();
      await service.createIntent('BK-1');

      booking.total = 9900;
      paypal.retrieveOrder
        .mockResolvedValueOnce({
          id: 'ord_1',
          status: 'CREATED',
          purchase_units: [{ amount: { currency_code: 'EUR', value: '45.00' } }],
        })
        .mockResolvedValueOnce({
          id: 'ord_1',
          status: 'CREATED',
          purchase_units: [{ amount: { currency_code: 'EUR', value: '99.00' } }],
        });

      await service.createIntent('BK-1');

      // Otherwise the traveller would pay the old, lower amount.
      expect(paypal.updateOrderAmount).toHaveBeenCalledWith('ord_1', 9900, 'EUR');
      expect(paypal.createOrder).toHaveBeenCalledTimes(1);
    });

    /**
     * An approved order carries the buyer's consent to a *figure*. Repricing it
     * behind them would charge an amount nobody agreed to, so it is abandoned.
     */
    it('starts a fresh order rather than repricing one the buyer already approved', async () => {
      const { service, paypal, booking } = makeStubs();
      await service.createIntent('BK-1');

      booking.total = 9900;
      paypal.retrieveOrder.mockResolvedValueOnce({
        id: 'ord_1',
        status: 'APPROVED',
        purchase_units: [{ amount: { currency_code: 'EUR', value: '45.00' } }],
      });

      await service.createIntent('BK-1');

      expect(paypal.updateOrderAmount).not.toHaveBeenCalled();
      expect(paypal.createOrder).toHaveBeenCalledTimes(2);
    });

    it('starts a fresh order when the stored one can no longer be paid', async () => {
      const { service, paypal } = makeStubs();
      await service.createIntent('BK-1');

      paypal.retrieveOrder.mockResolvedValueOnce({
        id: 'ord_1',
        status: 'VOIDED',
        purchase_units: [{ amount: { currency_code: 'EUR', value: '45.00' } }],
      });

      await service.createIntent('BK-1');

      expect(paypal.createOrder).toHaveBeenCalledTimes(2);
    });

    /**
     * The money is already there. Opening a second order would ask for it
     * twice; the repair is to apply the one that settled.
     */
    it('applies a stored order that already completed instead of opening another', async () => {
      const { service, paypal, payments, booking } = makeStubs();
      await service.createIntent('BK-1');

      paypal.retrieveOrder.mockResolvedValueOnce(completedOrder());

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(BusinessException);

      expect(paypal.createOrder).toHaveBeenCalledTimes(1);
      expect(payments[0]?.status).toBe('PAID');
      expect(booking.paymentStatus).toBe('PAID');
    });

    /**
     * A booking part way through Revolut when the provider was switched holds
     * an order id that means nothing to PayPal.
     */
    it('ignores a stored Revolut order id and opens a PayPal order', async () => {
      const { service, paypal, payments } = makeStubs();
      payments.push({
        id: 'p0',
        bookingId: 'b1',
        method: 'CARD',
        provider: 'REVOLUT',
        status: 'PENDING',
        amount: 4500,
        currency: 'EUR',
        providerIntentId: 'ord_from_revolut',
        transactionId: null,
        refundedAmount: 0,
        appliedRefundIds: [],
        booking: { id: 'b1', reference: 'BK-1', status: 'PENDING' },
      });

      await service.createIntent('BK-1');

      expect(paypal.retrieveOrder).not.toHaveBeenCalled();
      expect(paypal.createOrder).toHaveBeenCalledTimes(1);
    });

    it('refuses a booking that is already paid', async () => {
      const { service, booking } = makeStubs();
      booking.paymentStatus = 'PAID';

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(BusinessException);
    });
  });

  describe('capture', () => {
    async function opened() {
      const stubs = makeStubs();
      await stubs.service.createIntent('BK-1');
      stubs.paypal.retrieveOrder.mockClear();
      return stubs;
    }

    it('captures, confirms the booking and emails the tickets', async () => {
      const { service, paypal, booking, payments, mail, notes } = await opened();

      const result = await service.capture('BK-1', 'ord_1');

      expect(paypal.captureOrder).toHaveBeenCalledWith('ord_1');
      expect(result).toEqual({ status: 'PAID' });
      expect(payments[0]?.status).toBe('PAID');
      // The capture id, not the order id: a refund is made against the capture.
      expect(payments[0]?.transactionId).toBe('cap_1');
      expect(booking.status).toBe('CONFIRMED');
      expect(booking.paymentStatus).toBe('PAID');
      // The hold is over: the expiry sweeper must not cancel a paid booking.
      expect(booking.expiresAt).toBeNull();
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(notes.some((note) => note.body.includes('PayPal'))).toBe(true);
    });

    /**
     * The one attack this endpoint exists to refuse: a booking reference is not
     * a secret, so an order id posted against somebody else's booking must not
     * settle it.
     */
    it('refuses an order that was not opened for this booking', async () => {
      const { service, paypal } = await opened();

      await expect(service.capture('BK-1', 'ord_somebody_else')).rejects.toBeInstanceOf(
        BusinessException,
      );

      expect(paypal.captureOrder).not.toHaveBeenCalled();
    });

    it('does not confirm a booking captured for the wrong amount', async () => {
      const { service, paypal, booking, payments } = await opened();
      paypal.captureOrder.mockResolvedValueOnce(completedOrder(100));

      await service.capture('BK-1', 'ord_1');

      expect(payments[0]?.status).toBe('PENDING');
      expect(booking.paymentStatus).toBe('PENDING');
    });

    it('does not confirm a booking captured in the wrong currency', async () => {
      const { service, paypal, payments } = await opened();
      paypal.captureOrder.mockResolvedValueOnce(completedOrder(4500, 'USD'));

      await service.capture('BK-1', 'ord_1');

      expect(payments[0]?.status).toBe('PENDING');
    });

    /** PayPal holds some payments for review. Pending is an outcome, not a fault. */
    it('leaves the booking pending when the capture is not completed yet', async () => {
      const { service, paypal, payments } = await opened();
      paypal.captureOrder.mockResolvedValueOnce({
        id: 'ord_1',
        status: 'COMPLETED',
        purchase_units: [
          {
            amount: { currency_code: 'EUR', value: '45.00' },
            payments: {
              captures: [
                {
                  id: 'cap_1',
                  status: 'PENDING',
                  amount: { currency_code: 'EUR', value: '45.00' },
                },
              ],
            },
          },
        ],
      });

      const result = await service.capture('BK-1', 'ord_1');

      expect(result).toEqual({ status: 'PENDING' });
      expect(payments[0]?.status).toBe('PENDING');
    });

    /** A double-clicked button. The first capture worked; the second must not fail. */
    it('reads the order back when PayPal says it was already captured', async () => {
      const { service, paypal, payments } = await opened();
      paypal.captureOrder.mockRejectedValueOnce(
        new PayPalApiError(422, '{"details":[{"issue":"ORDER_ALREADY_CAPTURED"}]}'),
      );
      paypal.retrieveOrder.mockResolvedValueOnce(completedOrder());

      const result = await service.capture('BK-1', 'ord_1');

      expect(result).toEqual({ status: 'PAID' });
      expect(payments[0]?.status).toBe('PAID');
    });

    it('records the decline and leaves the booking retryable', async () => {
      const { service, paypal, booking, payments } = await opened();
      paypal.captureOrder.mockRejectedValueOnce(
        new PayPalApiError(422, '{"details":[{"issue":"INSTRUMENT_DECLINED"}]}'),
      );

      await expect(service.capture('BK-1', 'ord_1')).rejects.toBeInstanceOf(BusinessException);

      expect(payments[0]?.status).toBe('FAILED');
      // Still PENDING, not CANCELLED: the traveller can try another method.
      expect(booking.status).toBe('PENDING');
    });

    it('does nothing when the webhook already marked the booking paid', async () => {
      const { service, paypal } = await opened();
      await service.capture('BK-1', 'ord_1');
      paypal.captureOrder.mockClear();

      const result = await service.capture('BK-1', 'ord_1');

      expect(result).toEqual({ status: 'PAID' });
      expect(paypal.captureOrder).not.toHaveBeenCalled();
    });
  });

  describe('webhook', () => {
    async function opened() {
      const stubs = makeStubs();
      await stubs.service.createIntent('BK-1');
      stubs.paypal.retrieveOrder.mockClear();
      return stubs;
    }

    it('rejects an event PayPal will not vouch for', async () => {
      const { service, paypal } = await opened();
      paypal.verifyWebhookSignature.mockResolvedValueOnce('FAILURE');

      await expect(service.handleWebhook(event(CAPTURE_COMPLETED), HEADERS)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    /**
     * An outage must not look like a forgery. A 503 is what gets the event
     * redelivered instead of dropped, and the booking is left alone meanwhile.
     */
    it('answers 503, not 400, when PayPal cannot be reached to verify', async () => {
      const { service, paypal, payments } = await opened();
      paypal.verifyWebhookSignature.mockResolvedValueOnce('UNAVAILABLE');

      await expect(service.handleWebhook(event(CAPTURE_COMPLETED), HEADERS)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(payments[0]?.status).toBe('PENDING');
    });

    it('rejects an event with no transmission headers at all', async () => {
      const { service, paypal } = await opened();

      await expect(service.handleWebhook(event(CAPTURE_COMPLETED), {})).rejects.toBeInstanceOf(
        BusinessException,
      );

      // Refused locally: PayPal is never asked about a request that cannot be
      // genuine.
      expect(paypal.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    /** The certificate is fetched by PayPal, so the URL must be PayPal's. */
    it('rejects an event whose certificate URL is not PayPal’s', async () => {
      const { service, paypal } = await opened();

      await expect(
        service.handleWebhook(event(CAPTURE_COMPLETED), {
          ...HEADERS,
          'paypal-cert-url': 'https://api.paypal.com.attacker.test/certs/CERT-1',
        }),
      ).rejects.toBeInstanceOf(BusinessException);

      expect(paypal.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it('confirms the booking and emails the tickets on a completed capture', async () => {
      const { service, paypal, booking, payments, mail } = await opened();
      paypal.retrieveOrder.mockResolvedValueOnce(completedOrder());

      await service.handleWebhook(event(CAPTURE_COMPLETED), HEADERS);

      // The event is a trigger, not proof: the order was read back first.
      expect(paypal.retrieveOrder).toHaveBeenCalledWith('ord_1');
      expect(payments[0]?.status).toBe('PAID');
      expect(booking.paymentStatus).toBe('PAID');
      expect(booking.expiresAt).toBeNull();
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    /**
     * The event carries an amount, and it is not the one that is checked. What
     * counts is what PayPal says when asked directly.
     */
    it('ignores the amount on the event and judges the order it reads back', async () => {
      const { service, paypal, payments } = await opened();
      paypal.retrieveOrder.mockResolvedValueOnce(completedOrder(100));

      await service.handleWebhook(event(CAPTURE_COMPLETED), HEADERS);

      expect(payments[0]?.status).toBe('PENDING');
    });

    it('leaves the booking alone when the order cannot be read back', async () => {
      const { service, paypal, payments } = await opened();
      paypal.retrieveOrder.mockRejectedValueOnce(new PayPalApiError(500, 'boom'));

      await service.handleWebhook(event(CAPTURE_COMPLETED), HEADERS);

      // Unapplied on purpose: PayPal retries, and a booking must not be
      // confirmed on an event this server could not corroborate.
      expect(payments[0]?.status).toBe('PENDING');
    });

    it('ignores a replayed completion without sending a second email', async () => {
      const { service, paypal, mail } = await opened();
      paypal.retrieveOrder.mockResolvedValue(completedOrder());

      await service.handleWebhook(event(CAPTURE_COMPLETED), HEADERS);
      await service.handleWebhook(event(CAPTURE_COMPLETED), HEADERS);

      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    /** The browser never came back, so the server finishes the job itself. */
    it('captures an approved order nobody captured', async () => {
      const { service, paypal, payments } = await opened();

      await service.handleWebhook(
        event({
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: { id: 'ord_1', status: 'APPROVED' },
        }),
        HEADERS,
      );

      expect(paypal.captureOrder).toHaveBeenCalledWith('ord_1');
      expect(payments[0]?.status).toBe('PAID');
    });

    it('does not capture an approved order that belongs to nobody here', async () => {
      const { service, paypal } = await opened();

      await service.handleWebhook(
        event({
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: { id: 'ord_elsewhere', status: 'APPROVED' },
        }),
        HEADERS,
      );

      expect(paypal.captureOrder).not.toHaveBeenCalled();
    });

    it('records a decline and leaves the booking retryable', async () => {
      const { service, booking, payments } = await opened();

      await service.handleWebhook(
        event({
          event_type: 'PAYMENT.CAPTURE.DENIED',
          resource: { id: 'cap_1', supplementary_data: { related_ids: { order_id: 'ord_1' } } },
        }),
        HEADERS,
      );

      expect(payments[0]?.status).toBe('FAILED');
      expect(booking.status).toBe('PENDING');
    });

    /** A late failure must never undo a capture that already succeeded. */
    it('ignores a decline that arrives after the payment was captured', async () => {
      const { service, booking, payments } = await opened();
      await service.capture('BK-1', 'ord_1');

      await service.handleWebhook(
        event({
          event_type: 'PAYMENT.CAPTURE.DENIED',
          resource: { id: 'cap_1', supplementary_data: { related_ids: { order_id: 'ord_1' } } },
        }),
        HEADERS,
      );

      expect(payments[0]?.status).toBe('PAID');
      expect(booking.paymentStatus).toBe('PAID');
    });

    it('acknowledges an event it has no opinion about', async () => {
      const { service } = await opened();

      await expect(
        service.handleWebhook(
          event({ event_type: 'BILLING.SUBSCRIPTION.CREATED', resource: { id: 'x' } }),
          HEADERS,
        ),
      ).resolves.toEqual({ received: true });
    });

    it('rejects a payload that is not JSON', async () => {
      const { service } = await opened();

      await expect(service.handleWebhook(Buffer.from('not json'), HEADERS)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });
  });

  describe('refunds', () => {
    async function captured() {
      const stubs = makeStubs();
      await stubs.service.createIntent('BK-1');
      await stubs.service.capture('BK-1', 'ord_1');
      return stubs;
    }

    const refunded = (id: string, value: string) => ({
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: {
        id,
        amount: { currency_code: 'EUR', value },
        supplementary_data: { related_ids: { capture_id: 'cap_1' } },
      },
    });

    it('refunds against the capture, not the order', async () => {
      const { service, paypal, payments } = await captured();

      await service.refund(payments[0]!.id, 1000);

      expect(paypal.refundCapture).toHaveBeenCalledWith('cap_1', 1000, 'EUR', 'BK-1');
    });

    it('refuses to refund more than is left', async () => {
      const { service, payments } = await captured();

      await expect(service.refund(payments[0]!.id, 9999)).rejects.toBeInstanceOf(BusinessException);
    });

    it('refuses a payment that was never captured', async () => {
      const { service, payments } = makeStubs();
      await service.createIntent('BK-1');

      await expect(service.refund(payments[0]!.id)).rejects.toBeInstanceOf(BusinessException);
    });

    /**
     * A refund names the capture it reverses. Reaching the payment through the
     * capture id is the only route back, since the order id is not on the event.
     */
    it('folds a refund webhook into the payment behind its capture', async () => {
      const { service, payments } = await captured();

      await service.handleWebhook(event(refunded('ref_1', '10.00')), HEADERS);

      expect(payments[0]?.refundedAmount).toBe(1000);
      // Partial: money was still taken, so the payment stays PAID.
      expect(payments[0]?.status).toBe('PAID');
    });

    it('marks a payment refunded once the whole amount is back', async () => {
      const { service, payments } = await captured();

      await service.handleWebhook(event(refunded('ref_1', '45.00')), HEADERS);

      expect(payments[0]?.status).toBe('REFUNDED');
    });

    /** Otherwise a replayed webhook refunds the customer twice on paper. */
    it('applies the same refund only once', async () => {
      const { service, payments } = await captured();

      await service.handleWebhook(event(refunded('ref_1', '10.00')), HEADERS);
      await service.handleWebhook(event(refunded('ref_1', '10.00')), HEADERS);

      expect(payments[0]?.refundedAmount).toBe(1000);
    });

    it('adds a second, different refund to the running total', async () => {
      const { service, payments } = await captured();

      await service.handleWebhook(event(refunded('ref_1', '10.00')), HEADERS);
      await service.handleWebhook(event(refunded('ref_2', '5.00')), HEADERS);

      expect(payments[0]?.refundedAmount).toBe(1500);
    });

    it('ignores a refund for a capture that is not ours', async () => {
      const { service, payments } = await captured();

      await service.handleWebhook(
        event({
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          resource: {
            id: 'ref_x',
            amount: { currency_code: 'EUR', value: '10.00' },
            supplementary_data: { related_ids: { capture_id: 'cap_elsewhere' } },
          },
        }),
        HEADERS,
      );

      expect(payments[0]?.refundedAmount).toBe(0);
    });
  });
});
