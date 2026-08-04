import { BusinessException } from '../../common/exceptions/business.exception';
import type { PrismaService } from '../../database/prisma.service';
import type { DocumentsService } from '../documents/documents.service';
import type { MailService } from '../mail/mail.service';

import { AdminWriteService } from './admin-write.service';

/**
 * `updatePayment` decides what an operator is allowed to record about money the
 * business took by hand. The rules are worth pinning down: the status is the
 * one an operator chose rather than one inferred from the amount, and Pay Later
 * clears the fields that would otherwise claim money nobody has collected.
 *
 * Prisma is stubbed. `$transaction` here takes an array of already-built
 * promises, so the stubs record what they were asked to write and the
 * assertions read those calls back.
 */
function makeStubs(overrides: Partial<Record<string, unknown>> = {}) {
  const payment = {
    id: 'p1',
    method: 'CASH',
    status: 'PENDING',
    amount: 0,
    transactionId: null as string | null,
    paidAt: null as Date | null,
    refundedAt: null as Date | null,
    refundedAmount: 0,
    providerIntentId: null as string | null,
    booking: { id: 'b1', total: 4500, reference: 'BK-1' },
    ...overrides,
  };

  const paymentUpdate = jest.fn((args: unknown) => Promise.resolve(args));
  const bookingUpdate = jest.fn((args: unknown) => Promise.resolve(args));
  const logCreate = jest.fn((args: unknown) => Promise.resolve(args));

  const prisma = {
    payment: { findUnique: jest.fn(() => Promise.resolve(payment)), update: paymentUpdate },
    booking: { update: bookingUpdate },
    activityLog: { create: logCreate },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaService;

  const service = new AdminWriteService(prisma, {} as DocumentsService, {} as MailService);

  /** What the payment row was actually asked to be set to. */
  const written = () =>
    (paymentUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

  const bookingWritten = () =>
    (bookingUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

  return { service, written, bookingWritten, logCreate };
}

describe('AdminWriteService.updatePayment', () => {
  it('files the payment under the status the operator chose', async () => {
    const { service, written, bookingWritten } = makeStubs();

    await service.updatePayment('p1', { status: 'FAILED' }, 'admin-1');

    // FAILED is a state no amount implies — before it could be sent, a declined
    // card had no way of being recorded at all.
    expect(written()?.status).toBe('FAILED');
    expect(bookingWritten()?.paymentStatus).toBe('FAILED');
  });

  it('honours PAID even when the amount falls short of the booking total', async () => {
    const { service, written } = makeStubs();

    await service.updatePayment('p1', { amountMinor: 1000, status: 'PAID' }, 'admin-1');

    expect(written()?.status).toBe('PAID');
    // A payment filed as settled without a date is stamped rather than left
    // reading "not yet".
    expect(written()?.paidAt).toBeInstanceOf(Date);
  });

  it('still derives the status when none is sent', async () => {
    const { service, written } = makeStubs();

    await service.updatePayment('p1', { amountMinor: 4500 }, 'admin-1');
    expect(written()?.status).toBe('PAID');

    const short = makeStubs();
    await short.service.updatePayment('p1', { amountMinor: 1000 }, 'admin-1');
    expect(short.written()?.status).toBe('PENDING');
  });

  it('records how much went back when filed as refunded', async () => {
    const { service, written } = makeStubs({ amount: 4500, status: 'PAID', paidAt: new Date() });

    await service.updatePayment('p1', { status: 'REFUNDED' }, 'admin-1');

    expect(written()?.status).toBe('REFUNDED');
    expect(written()?.refundedAmount).toBe(4500);
    // The date the money originally arrived survives: that it was later
    // returned does not mean it never came in.
    expect(written()?.paidAt).toBeInstanceOf(Date);
  });

  it('clears the money fields when the method becomes Pay Later', async () => {
    const { service, written, bookingWritten } = makeStubs({
      method: 'CASH',
      status: 'PAID',
      amount: 4500,
      transactionId: 'txn_123',
      paidAt: new Date(),
    });

    await service.updatePayment(
      'p1',
      // Everything the form might still have carried, sent anyway.
      { method: 'PAY_LATER', amountMinor: 4500, transactionId: 'txn_123', status: 'PAID' },
      'admin-1',
    );

    expect(written()?.method).toBe('PAY_LATER');
    expect(written()?.amount).toBe(0);
    expect(written()?.transactionId).toBeNull();
    expect(written()?.paidAt).toBeNull();
    // Nothing has been collected, so it cannot be anything but outstanding.
    expect(written()?.status).toBe('PENDING');
    expect(bookingWritten()?.paymentStatus).toBe('PENDING');
  });

  it('refuses a payment Stripe captured', async () => {
    const { service } = makeStubs({ providerIntentId: 'pi_123' });

    await expect(service.updatePayment('p1', { status: 'PAID' }, 'admin-1')).rejects.toBeInstanceOf(
      BusinessException,
    );
  });
});
