import { createHmac } from 'node:crypto';

import { ServiceUnavailableException } from '@nestjs/common';

import { BusinessException } from '../../../common/exceptions/business.exception';
import type { PrismaService } from '../../../database/prisma.service';
import type { DocumentsService } from '../../documents/documents.service';
import type { MailService } from '../../mail/mail.service';
import { PaymentLedgerService } from '../payment-ledger.service';

import { RevolutPaymentsService } from './revolut-payments.service';
import type { RevolutClient, RevolutOrder } from './revolut.client';

const CONFIG = {
  apiUrl: 'https://sandbox-merchant.revolut.com',
  secretKey: 'sk_test_stub',
  publicKey: 'pk_test_stub',
  webhookSecrets: ['wsk_stub'],
  environment: 'sandbox' as const,
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

/**
 * In-memory stand-ins for the tables the service touches, and a stubbed
 * Revolut. The rules under test are this application's — read the order back
 * before believing an event, refuse a mismatched amount, apply a refund once —
 * and none of them need a network round trip to verify.
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

  const prisma = {
    booking: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          ...booking,
          customer: { email: 'a@b.test', fullName: 'Ada' },
          payments: [...payments].reverse().slice(0, 1),
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
            method: 'CARD',
            provider: 'REVOLUT',
            status: 'PENDING',
            amount: booking.total,
            currency: booking.currency,
            providerIntentId: null,
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

  const order: RevolutOrder = {
    id: 'ord_1',
    token: 'tok_1',
    state: 'pending',
    amount: 4500,
    currency: 'EUR',
  };

  const revolut = {
    isEnabled: true,
    createOrder: jest.fn(() => Promise.resolve({ ...order })),
    retrieveOrder: jest.fn(() => Promise.resolve({ ...order })),
    updateOrder: jest.fn((id: string, amount: number, currency: string) =>
      Promise.resolve({ ...order, id, amount, currency }),
    ),
    refundOrder: jest.fn(() => Promise.resolve({ ...order, id: 'ref_1', state: 'completed' })),
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

  const service = new RevolutPaymentsService(ledger, revolut as unknown as RevolutClient, CONFIG);

  return { service, ledger, prisma, revolut, documents, mail, booking, payments, notes, order };
}

/** A payload signed exactly the way Revolut signs one. */
function signed(payload: object, timestamp = String(Date.now())) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', CONFIG.webhookSecrets[0]!)
    .update(`v1.${timestamp}.${body}`)
    .digest('hex');

  return { raw: Buffer.from(body), header: `v1=${signature}`, timestamp };
}

describe('RevolutPaymentsService', () => {
  describe('when Revolut is not configured', () => {
    it('answers 503 rather than throwing at boot', async () => {
      const { ledger } = makeStubs();
      const service = new RevolutPaymentsService(
        ledger,
        { isEnabled: false } as unknown as RevolutClient,
        { ...CONFIG, secretKey: undefined, enabled: false },
      );

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('createIntent', () => {
    it('opens an order for the booking total and stores its private id', async () => {
      const { service, revolut, payments } = makeStubs();

      const result = await service.createIntent('BK-1');

      expect(revolut.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 4500, currency: 'EUR' }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          provider: 'revolut',
          token: 'tok_1',
          publicKey: 'pk_test_stub',
          environment: 'sandbox',
        }),
      );
      // The public token goes to the browser; the private id stays here.
      expect(payments[0]?.providerIntentId).toBe('ord_1');
    });

    it('reuses an unfinished order instead of stranding a second one', async () => {
      const { service, revolut, payments } = makeStubs();
      await service.createIntent('BK-1');

      await service.createIntent('BK-1');

      expect(revolut.createOrder).toHaveBeenCalledTimes(1);
      expect(payments).toHaveLength(1);
    });

    it('reprices the order when the booking was edited after it was opened', async () => {
      const { service, revolut, booking } = makeStubs();
      await service.createIntent('BK-1');

      booking.total = 9900;
      await service.createIntent('BK-1');

      // Otherwise the traveller would be charged the old, lower amount.
      expect(revolut.updateOrder).toHaveBeenCalledWith('ord_1', 9900, 'EUR');
      expect(revolut.createOrder).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh order when the stored one can no longer be paid', async () => {
      const { service, revolut } = makeStubs();
      await service.createIntent('BK-1');

      revolut.retrieveOrder.mockResolvedValueOnce({
        id: 'ord_1',
        token: 'tok_1',
        state: 'completed',
        amount: 4500,
        currency: 'EUR',
      });

      await service.createIntent('BK-1');

      expect(revolut.createOrder).toHaveBeenCalledTimes(2);
    });

    /**
     * A booking part way through Stripe when the provider was switched holds an
     * intent id that means nothing to Revolut. Handing it over would 404 in
     * front of a traveller with a card in their hand.
     */
    it('ignores a stored Stripe intent id and opens a Revolut order', async () => {
      const { service, revolut, payments } = makeStubs();
      payments.push({
        id: 'p0',
        bookingId: 'b1',
        method: 'CARD',
        provider: 'STRIPE',
        status: 'PENDING',
        amount: 4500,
        currency: 'EUR',
        providerIntentId: 'pi_from_stripe',
        refundedAmount: 0,
        appliedRefundIds: [],
        booking: { id: 'b1', reference: 'BK-1', status: 'PENDING' },
      });

      await service.createIntent('BK-1');

      expect(revolut.retrieveOrder).not.toHaveBeenCalled();
      expect(revolut.createOrder).toHaveBeenCalledTimes(1);
    });

    it('refuses a booking that is already paid', async () => {
      const { service, booking } = makeStubs();
      booking.paymentStatus = 'PAID';

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(BusinessException);
    });
  });

  describe('webhook', () => {
    async function opened() {
      const stubs = makeStubs();
      await stubs.service.createIntent('BK-1');
      stubs.revolut.retrieveOrder.mockClear();
      return stubs;
    }

    const completed = { event: 'ORDER_COMPLETED', order_id: 'ord_1' };

    it('rejects a payload whose signature does not verify', async () => {
      const { service } = await opened();
      const { raw, timestamp } = signed(completed);

      await expect(service.handleWebhook(raw, 'v1=deadbeef', timestamp)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('rejects a payload with no signature header at all', async () => {
      const { service } = await opened();
      const { raw, timestamp } = signed(completed);

      await expect(service.handleWebhook(raw, undefined, timestamp)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    /** A captured payload must not be replayable tomorrow. */
    it('rejects a correctly signed payload that is hours old', async () => {
      const { service } = await opened();
      const stale = String(Date.now() - 6 * 60 * 60_000);
      const { raw, header } = signed(completed, stale);

      await expect(service.handleWebhook(raw, header, stale)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('confirms the booking and emails the tickets once the order really is completed', async () => {
      const { service, revolut, booking, payments, mail, notes } = await opened();
      revolut.retrieveOrder.mockResolvedValue({
        id: 'ord_1',
        state: 'completed',
        amount: 4500,
        currency: 'EUR',
      });

      const { raw, header, timestamp } = signed(completed);
      await service.handleWebhook(raw, header, timestamp);

      // The event is a trigger, not proof: the order was read back first.
      expect(revolut.retrieveOrder).toHaveBeenCalledWith('ord_1');
      expect(payments[0]?.status).toBe('PAID');
      expect(booking.status).toBe('CONFIRMED');
      expect(booking.paymentStatus).toBe('PAID');
      // The hold is over: the expiry sweeper must not release paid seats.
      expect(booking.expiresAt).toBeNull();
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(notes.some((note) => note.body.includes('Revolut'))).toBe(true);
    });

    it('ignores a replayed completion without sending a second email', async () => {
      const { service, revolut, mail } = await opened();
      revolut.retrieveOrder.mockResolvedValue({
        id: 'ord_1',
        state: 'completed',
        amount: 4500,
        currency: 'EUR',
      });

      const first = signed(completed);
      await service.handleWebhook(first.raw, first.header, first.timestamp);
      const second = signed(completed);
      await service.handleWebhook(second.raw, second.header, second.timestamp);

      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    /**
     * The read-back is the safety net. An event naming an order that has not
     * actually settled must leave the booking alone.
     */
    it('does not confirm a booking whose order is not completed', async () => {
      const { service, revolut, booking, payments } = await opened();
      revolut.retrieveOrder.mockResolvedValue({
        id: 'ord_1',
        state: 'processing',
        amount: 4500,
        currency: 'EUR',
      });

      const { raw, header, timestamp } = signed(completed);
      await service.handleWebhook(raw, header, timestamp);

      expect(payments[0]?.status).toBe('PENDING');
      expect(booking.paymentStatus).toBe('PENDING');
    });

    it('does not confirm a booking that was settled for the wrong amount', async () => {
      const { service, revolut, payments } = await opened();
      revolut.retrieveOrder.mockResolvedValue({
        id: 'ord_1',
        state: 'completed',
        amount: 100,
        currency: 'EUR',
      });

      const { raw, header, timestamp } = signed(completed);
      await service.handleWebhook(raw, header, timestamp);

      expect(payments[0]?.status).toBe('PENDING');
    });

    it('leaves the order unapplied when it cannot be read back', async () => {
      const { service, revolut, payments } = await opened();
      revolut.retrieveOrder.mockRejectedValue(new Error('revolut is down'));

      const { raw, header, timestamp } = signed(completed);
      await expect(service.handleWebhook(raw, header, timestamp)).resolves.toEqual({
        received: true,
      });
      expect(payments[0]?.status).toBe('PENDING');
    });

    it('records a decline but leaves the booking pending so it can be retried', async () => {
      const { service, booking, payments, notes } = await opened();

      const { raw, header, timestamp } = signed({
        event: 'ORDER_PAYMENT_DECLINED',
        order_id: 'ord_1',
      });
      await service.handleWebhook(raw, header, timestamp);

      expect(payments[0]?.status).toBe('FAILED');
      expect(booking.status).toBe('PENDING');
      expect(notes.some((note) => note.body.includes('declined'))).toBe(true);
    });

    it('acknowledges an event it has no opinion about', async () => {
      const { service } = await opened();

      const { raw, header, timestamp } = signed({ event: 'PAYOUT_INITIATED', order_id: 'ord_1' });
      await expect(service.handleWebhook(raw, header, timestamp)).resolves.toEqual({
        received: true,
      });
    });

    describe('refunds', () => {
      async function paid() {
        const stubs = await opened();
        stubs.revolut.retrieveOrder.mockResolvedValue({
          id: 'ord_1',
          state: 'completed',
          amount: 4500,
          currency: 'EUR',
        });
        const capture = signed(completed);
        await stubs.service.handleWebhook(capture.raw, capture.header, capture.timestamp);
        return stubs;
      }

      function refundOrder(id: string, amount: number) {
        return {
          id,
          state: 'completed' as const,
          amount,
          currency: 'EUR',
          related_order_id: 'ord_1',
        };
      }

      it('folds a refund into the payment through its related order', async () => {
        const { service, revolut, payments } = await paid();
        revolut.retrieveOrder.mockResolvedValue(refundOrder('ref_1', 4500));

        const { raw, header, timestamp } = signed({
          event: 'REFUND_COMPLETED',
          order_id: 'ref_1',
        });
        await service.handleWebhook(raw, header, timestamp);

        expect(payments[0]?.refundedAmount).toBe(4500);
        expect(payments[0]?.status).toBe('REFUNDED');
      });

      it('leaves a partly refunded payment as PAID', async () => {
        const { service, revolut, payments } = await paid();
        revolut.retrieveOrder.mockResolvedValue(refundOrder('ref_1', 1000));

        const { raw, header, timestamp } = signed({
          event: 'REFUND_COMPLETED',
          order_id: 'ref_1',
        });
        await service.handleWebhook(raw, header, timestamp);

        // Money was still captured; `refundedAmount` is what tells them apart.
        expect(payments[0]?.status).toBe('PAID');
        expect(payments[0]?.refundedAmount).toBe(1000);
      });

      /**
       * Revolut reports one refund at a time rather than a running total, so a
       * replay would otherwise refund the traveller twice on paper.
       */
      it('does not count a replayed refund twice', async () => {
        const { service, revolut, payments } = await paid();
        revolut.retrieveOrder.mockResolvedValue(refundOrder('ref_1', 1000));

        const first = signed({ event: 'REFUND_COMPLETED', order_id: 'ref_1' });
        await service.handleWebhook(first.raw, first.header, first.timestamp);
        const second = signed({ event: 'REFUND_COMPLETED', order_id: 'ref_1' });
        await service.handleWebhook(second.raw, second.header, second.timestamp);

        expect(payments[0]?.refundedAmount).toBe(1000);
      });

      it('adds a second, distinct refund to the total', async () => {
        const { service, revolut, payments } = await paid();

        revolut.retrieveOrder.mockResolvedValue(refundOrder('ref_1', 1000));
        const first = signed({ event: 'REFUND_COMPLETED', order_id: 'ref_1' });
        await service.handleWebhook(first.raw, first.header, first.timestamp);

        revolut.retrieveOrder.mockResolvedValue(refundOrder('ref_2', 500));
        const second = signed({ event: 'REFUND_COMPLETED', order_id: 'ref_2' });
        await service.handleWebhook(second.raw, second.header, second.timestamp);

        expect(payments[0]?.refundedAmount).toBe(1500);
      });
    });
  });

  describe('refund', () => {
    async function captured() {
      const stubs = makeStubs();
      await stubs.service.createIntent('BK-1');
      stubs.payments[0]!.status = 'PAID';
      return stubs;
    }

    it('refunds the whole remaining amount by default', async () => {
      const { service, revolut, payments } = await captured();

      await service.refund(payments[0]!.id);

      expect(revolut.refundOrder).toHaveBeenCalledWith('ord_1', 4500, 'EUR');
    });

    it('refunds only what is asked for', async () => {
      const { service, revolut, payments } = await captured();

      await service.refund(payments[0]!.id, 1500);

      expect(revolut.refundOrder).toHaveBeenCalledWith('ord_1', 1500, 'EUR');
    });

    it('refuses to refund more than remains', async () => {
      const { service, payments } = await captured();
      payments[0]!.refundedAmount = 4000;

      await expect(service.refund(payments[0]!.id, 1000)).rejects.toBeInstanceOf(BusinessException);
    });

    it('refuses to refund a payment that was never captured', async () => {
      const { service, payments } = await captured();
      payments[0]!.status = 'PENDING';

      await expect(service.refund(payments[0]!.id)).rejects.toBeInstanceOf(BusinessException);
    });
  });
});
