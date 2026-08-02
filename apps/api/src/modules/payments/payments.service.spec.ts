import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type Stripe from 'stripe';

import { BusinessException } from '../../common/exceptions/business.exception';
import type { PrismaService } from '../../database/prisma.service';
import type { DocumentsService } from '../documents/documents.service';
import type { MailService } from '../mail/mail.service';

import { PaymentsService } from './payments.service';

const CONFIG = {
  secretKey: 'sk_test_stub',
  publishableKey: 'pk_test_stub',
  webhookSecret: 'whsec_stub',
  enabled: true,
};

interface PaymentRow {
  id: string;
  bookingId: string;
  status: string;
  amount: number;
  currency: string;
  providerIntentId: string | null;
  refundedAmount: number;
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
 * In-memory stand-ins for the tables the service touches.
 *
 * Stripe itself is stubbed too: these tests are about *this* application's
 * rules — replay safety, reuse of an intent, refund arithmetic — none of which
 * need a network round trip to verify, and all of which would otherwise be
 * unverifiable without live credentials.
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
          const row: PaymentRow = {
            id: `p${payments.length + 1}`,
            bookingId: booking.id,
            status: 'PENDING',
            amount: booking.total,
            currency: booking.currency,
            providerIntentId: null,
            refundedAmount: 0,
            booking: { id: booking.id, reference: booking.reference, status: booking.status },
            ...create,
          } as PaymentRow;
          payments.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<PaymentRow> }) => {
        const row = payments.find((entry) => entry.id === where.id);
        if (row) Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    bookingNote: {
      create: jest.fn(({ data }: { data: { bookingId: string; body: string } }) => {
        notes.push(data);
        return Promise.resolve(data);
      }),
    },
    // The service passes an array of already-built promises; awaiting them is
    // exactly what a real transaction does here, minus the atomicity.
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  const stripe = {
    paymentIntents: {
      create: jest.fn((params: Stripe.PaymentIntentCreateParams) =>
        Promise.resolve({
          id: 'pi_new',
          status: 'requires_payment_method',
          amount: params.amount,
          client_secret: 'pi_new_secret',
        }),
      ),
      retrieve: jest.fn(() => Promise.resolve(null)),
      update: jest.fn((id: string, params: { amount: number }) =>
        Promise.resolve({
          id,
          status: 'requires_payment_method',
          amount: params.amount,
          client_secret: `${id}_secret`,
        }),
      ),
    },
    refunds: { create: jest.fn(() => Promise.resolve({ id: 're_1' })) },
    webhooks: { constructEvent: jest.fn() },
  };

  const documents = {
    loadBooking: jest.fn(() =>
      Promise.resolve({ reference: 'BK-1', customer: { email: 'a@b.test' } }),
    ),
    confirmationEmail: jest.fn(() => ({ subject: 's', html: 'h', text: 't' })),
    ticketPdf: jest.fn(() => Promise.resolve(Buffer.from('%PDF-'))),
  };

  const mail = { send: jest.fn(() => Promise.resolve()) };

  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    documents as unknown as DocumentsService,
    mail as unknown as MailService,
    stripe as unknown as Stripe,
    CONFIG,
  );

  return { service, prisma, stripe, documents, mail, booking, payments, notes };
}

describe('PaymentsService', () => {
  describe('when Stripe is not configured', () => {
    it('answers 503 rather than throwing at boot', async () => {
      const service = new PaymentsService(
        {} as PrismaService,
        {} as DocumentsService,
        {} as MailService,
        // No client: the environment has no secret key.
        null,
        { ...CONFIG, secretKey: undefined, enabled: false },
      );

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(service.handleWebhook(Buffer.alloc(0), 'sig')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('createIntent', () => {
    it('creates an intent for the booking total and stores its id', async () => {
      const { service, stripe, payments } = makeStubs();

      const result = await service.createIntent('BK-1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 4500, currency: 'eur', payment_method_types: ['card'] }),
        // Keyed on the booking, so a double-submit cannot create two intents.
        { idempotencyKey: 'booking-intent-b1' },
      );
      expect(result.clientSecret).toBe('pi_new_secret');
      expect(result.publishableKey).toBe('pk_test_stub');
      expect(payments[0]?.providerIntentId).toBe('pi_new');
    });

    it('reuses an unfinished intent instead of stranding a second one', async () => {
      const { service, stripe, payments } = makeStubs();
      await service.createIntent('BK-1');

      stripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_new',
        status: 'requires_payment_method',
        amount: 4500,
        client_secret: 'pi_new_secret',
      } as never);

      const second = await service.createIntent('BK-1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
      expect(second.clientSecret).toBe('pi_new_secret');
      expect(payments).toHaveLength(1);
    });

    it('updates the amount when the booking was edited after the intent', async () => {
      const { service, stripe, booking } = makeStubs();
      await service.createIntent('BK-1');

      stripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_new',
        status: 'requires_payment_method',
        amount: 4500,
        client_secret: 'pi_new_secret',
      } as never);
      booking.total = 9900;

      await service.createIntent('BK-1');

      // Otherwise the traveller would be charged the old, lower amount.
      expect(stripe.paymentIntents.update).toHaveBeenCalledWith('pi_new', { amount: 9900 });
    });

    it('starts a fresh intent when the stored one already succeeded', async () => {
      const { service, stripe } = makeStubs();
      await service.createIntent('BK-1');

      stripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_new',
        status: 'succeeded',
        amount: 4500,
        client_secret: 'pi_new_secret',
      } as never);

      await service.createIntent('BK-1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(2);
    });

    it('refuses a booking that is already paid', async () => {
      const { service, booking } = makeStubs();
      booking.paymentStatus = 'PAID';

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(BusinessException);
    });

    it('refuses a cancelled booking', async () => {
      const { service, booking } = makeStubs();
      booking.status = 'CANCELLED';

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(BusinessException);
    });

    it('refuses a booking whose hold has expired', async () => {
      const { service, booking } = makeStubs();
      booking.expiresAt = new Date(Date.now() - 1000);

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(BusinessException);
    });

    it('404s for an unknown reference', async () => {
      const { service, prisma } = makeStubs();
      prisma.booking.findFirst.mockResolvedValueOnce(null as never);

      await expect(service.createIntent('BK-NOPE')).rejects.toBeInstanceOf(NotFoundException);
    });

    /**
     * A pay-on-arrival booking is confirmed but deliberately unpaid, so it
     * passes every other guard here. Without an explicit refusal a crafted
     * request could open an intent against it, and the webhook would then mark
     * it PAID while the money is still expected in person — the till would be
     * short with nothing in the record to explain it.
     */
    it('refuses a cash booking — there is no card leg to open', async () => {
      const { service, prisma, booking, stripe } = makeStubs();
      prisma.booking.findFirst.mockResolvedValueOnce({
        ...booking,
        status: 'CONFIRMED',
        expiresAt: null,
        customer: { email: 'a@b.test', fullName: 'Ada' },
        payments: [
          {
            id: 'p1',
            method: 'CASH',
            status: 'PENDING',
            providerIntentId: null,
            amount: booking.total,
          },
        ],
      } as never);

      await expect(service.createIntent('BK-1')).rejects.toBeInstanceOf(BusinessException);
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });
  });

  describe('webhook', () => {
    async function paidBooking() {
      const stubs = makeStubs();
      await stubs.service.createIntent('BK-1');
      return stubs;
    }

    it('rejects a payload whose signature does not verify', async () => {
      const { service, stripe } = makeStubs();
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('no signature match');
      });

      await expect(service.handleWebhook(Buffer.from('{}'), 'bad')).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('rejects a payload with no signature header at all', async () => {
      const { service } = makeStubs();

      await expect(service.handleWebhook(Buffer.from('{}'), undefined)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('verifies against the raw bytes, not a re-serialised object', async () => {
      const { service, stripe } = makeStubs();
      const raw = Buffer.from('{"id":"evt_1"}');
      stripe.webhooks.constructEvent.mockReturnValue({ type: 'customer.created' } as never);

      await service.handleWebhook(raw, 'sig');

      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(raw, 'sig', 'whsec_stub');
    });

    it('confirms the booking and emails the tickets when an intent succeeds', async () => {
      const { service, stripe, booking, payments, mail, notes } = await paidBooking();

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_new', latest_charge: 'ch_1' } },
      } as never);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(payments[0]?.status).toBe('PAID');
      expect(booking.status).toBe('CONFIRMED');
      expect(booking.paymentStatus).toBe('PAID');
      // The hold is over: the expiry sweeper must not release paid seats.
      expect(booking.expiresAt).toBeNull();
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(notes.some((note) => note.body.includes('Payment captured'))).toBe(true);
    });

    it('ignores a replayed success without sending a second email', async () => {
      const { service, stripe, mail } = await paidBooking();

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_new', latest_charge: 'ch_1' } },
      } as never);

      await service.handleWebhook(Buffer.from('{}'), 'sig');
      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('still confirms the booking when the confirmation email fails', async () => {
      const { service, stripe, booking, mail } = await paidBooking();
      mail.send.mockRejectedValueOnce(new Error('smtp down') as never);

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_new', latest_charge: 'ch_1' } },
      } as never);

      // A mail failure must never undo a payment that succeeded.
      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({
        received: true,
      });
      expect(booking.paymentStatus).toBe('PAID');
    });

    it('records a decline but leaves the booking pending so it can be retried', async () => {
      const { service, stripe, booking, payments, notes } = await paidBooking();

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_new', last_payment_error: { message: 'Card declined' } } },
      } as never);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(payments[0]?.status).toBe('FAILED');
      expect(booking.status).toBe('PENDING');
      expect(notes.some((note) => note.body.includes('Card declined'))).toBe(true);
    });

    it('does not let a late failure event undo a captured payment', async () => {
      const { service, stripe, payments } = await paidBooking();

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_new', latest_charge: 'ch_1' } },
      } as never);
      await service.handleWebhook(Buffer.from('{}'), 'sig');

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_new', last_payment_error: { message: 'too late' } } },
      } as never);
      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(payments[0]?.status).toBe('PAID');
    });

    it('mirrors a full refund made in the Stripe dashboard', async () => {
      const { service, stripe, payments } = await paidBooking();

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_new', amount_refunded: 4500 } },
      } as never);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(payments[0]?.status).toBe('REFUNDED');
      expect(payments[0]?.refundedAmount).toBe(4500);
    });

    it('leaves a partly refunded payment as PAID', async () => {
      const { service, stripe, payments } = await paidBooking();

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_new', amount_refunded: 1000 } },
      } as never);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      // Money was still captured; `refundedAmount` is what tells the two apart.
      expect(payments[0]?.status).toBe('PAID');
      expect(payments[0]?.refundedAmount).toBe(1000);
    });

    it('acknowledges an event it has no opinion about', async () => {
      const { service, stripe } = makeStubs();
      stripe.webhooks.constructEvent.mockReturnValue({ type: 'invoice.paid' } as never);

      // Returning an error would make Stripe retry it forever.
      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({
        received: true,
      });
    });

    it('ignores a success for an intent this database has never seen', async () => {
      const { service, stripe, prisma } = makeStubs();
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_unknown' } },
      } as never);

      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({
        received: true,
      });
      expect(prisma.booking.update).not.toHaveBeenCalled();
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
      const { service, stripe, payments } = await captured();

      await service.refund(payments[0]!.id);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_new', amount: 4500 },
        { idempotencyKey: 'refund-p1-0-4500' },
      );
    });

    it('refunds only what is asked for', async () => {
      const { service, stripe, payments } = await captured();

      await service.refund(payments[0]!.id, 1500);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1500 }),
        expect.anything(),
      );
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

    it('404s for a payment that does not exist', async () => {
      const { service } = await captured();

      await expect(service.refund('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
