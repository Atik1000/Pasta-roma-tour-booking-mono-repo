import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service';
import type { DocumentsService } from '../documents/documents.service';
import type { MailService } from '../mail/mail.service';

import { AdminWriteService } from './admin-write.service';

/**
 * `createSlotSchedule` is what makes a new tour bookable — before it, every
 * departure was a separate request and tours reached the public site with
 * nothing to sell. The rules worth pinning down are that it writes one row per
 * date × time, and that re-running a schedule leaves departures that already
 * exist alone rather than resetting their capacity.
 */
function makeStubs({ tourExists = true }: { tourExists?: boolean } = {}) {
  const createMany = jest.fn(({ data }: { data: unknown[] }) =>
    // Prisma reports the rows it actually inserted; the stub pretends the first
    // one collided so the skipped count has something to be counted from.
    Promise.resolve({ count: Math.max(0, data.length - 1) }),
  );

  const prisma = {
    tour: { findFirst: jest.fn(() => Promise.resolve(tourExists ? { id: 't1' } : null)) },
    tourSlot: { createMany },
  } as unknown as PrismaService;

  const service = new AdminWriteService(prisma, {} as DocumentsService, {} as MailService);

  const written = () =>
    (createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] } | undefined)?.data ?? [];

  return { service, createMany, written };
}

describe('AdminWriteService.createSlotSchedule', () => {
  it('writes one departure per date and time', async () => {
    const { service, written } = makeStubs();

    const result = await service.createSlotSchedule('t1', {
      dates: ['2030-06-01', '2030-06-02'],
      times: ['09:00', '14:30'],
      capacity: 20,
    });

    expect(written()).toHaveLength(4);
    expect(written()[0]).toEqual({
      tourId: 't1',
      date: new Date('2030-06-01T00:00:00.000Z'),
      time: '09:00',
      capacity: 20,
    });
    // Three inserted, one already there.
    expect(result).toEqual({ created: 3, skipped: 1 });
  });

  it('leaves existing departures untouched', async () => {
    const { service, createMany } = makeStubs();

    await service.createSlotSchedule('t1', {
      dates: ['2030-06-01'],
      times: ['09:00'],
      capacity: 20,
    });

    // Not an upsert: a departure with seats already sold keeps its capacity.
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('collapses repeated dates and times', async () => {
    const { service, written } = makeStubs();

    await service.createSlotSchedule('t1', {
      dates: ['2030-06-01', '2030-06-01'],
      times: ['09:00', '09:00'],
      capacity: 5,
    });

    expect(written()).toHaveLength(1);
  });

  it('refuses a schedule larger than the ceiling', async () => {
    const { service, createMany } = makeStubs();

    // Within the DTO's own caps — 350 dates and 6 times each pass validation
    // and only the combination of the two crosses the line.
    const dates = Array.from({ length: 350 }, (_, index) =>
      new Date(Date.UTC(2030, 0, index + 1)).toISOString().slice(0, 10),
    );

    await expect(
      service.createSlotSchedule('t1', {
        dates,
        times: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'],
        capacity: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(createMany).not.toHaveBeenCalled();
  });

  it('refuses a tour that does not exist', async () => {
    const { service } = makeStubs({ tourExists: false });

    await expect(
      service.createSlotSchedule('nope', { dates: ['2030-06-01'], times: ['09:00'], capacity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
