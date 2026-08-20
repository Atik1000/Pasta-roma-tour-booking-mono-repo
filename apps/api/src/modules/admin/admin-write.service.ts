import { Injectable, NotFoundException } from '@nestjs/common';
import { slugify } from '@pasta/utils';

import { BusinessErrorCode, BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { MailService } from '../mail/mail.service';
import type {
  SaveBlogDto,
  SaveLocationDto,
  SaveTourDto,
  SaveTourImagesDto,
  UpdateBookingDto,
  UpdatePaymentDto,
  UpsertNoteDto,
} from './dto/admin-write.dto';

@Injectable()
export class AdminWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly mail: MailService,
  ) {}

  /** Appends `-2`, `-3`… until the slug is free. */
  private async uniqueSlug(
    table: 'tour' | 'blog',
    desired: string,
    ignoreId?: string,
  ): Promise<string> {
    const base = slugify(desired) || 'untitled';
    let candidate = base;

    for (let attempt = 2; attempt < 100; attempt += 1) {
      const existing =
        table === 'tour'
          ? await this.prisma.tour.findUnique({ where: { slug: candidate }, select: { id: true } })
          : await this.prisma.blog.findUnique({ where: { slug: candidate }, select: { id: true } });

      if (!existing || existing.id === ignoreId) return candidate;
      candidate = `${base}-${attempt}`;
    }

    throw new BusinessException(BusinessErrorCode.SlugTaken, 'Could not derive a unique slug.');
  }

  // --- tours -----------------------------------------------------------------

  private async resolveLocationId(name: string): Promise<string> {
    const location = await this.prisma.location.findFirst({
      where: { name, deletedAt: null },
      select: { id: true },
    });

    if (!location) {
      throw new NotFoundException(`Unknown location: ${name}`);
    }

    return location.id;
  }

  async createTour(dto: SaveTourDto): Promise<{ id: string; slug: string }> {
    const slug = await this.uniqueSlug('tour', dto.slug ?? dto.title);
    const locationId = await this.resolveLocationId(dto.location);

    const tour = await this.prisma.tour.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        durationHours: dto.durationHours,
        type: dto.type,
        status: dto.published ? 'PUBLISHED' : 'DRAFT',
        locationId,
        priceAdultEur: dto.priceEurMinor,
        priceAdultUsd: dto.priceUsdMinor,
        maxTicketsPerTour: dto.maxTicketsPerTour,
        meetingPointTitle: dto.meetingPointTitle,
        meetingPointAddress: dto.meetingPointAddress,
        bullets: { create: AdminWriteService.bulletRows(dto) },
        plans: {
          create: dto.plans.map((plan, index) => ({
            position: index + 1,
            title: plan.title,
            description: plan.description,
          })),
        },
      },
      select: { id: true, slug: true },
    });

    return tour;
  }

  async updateTour(id: string, dto: SaveTourDto): Promise<{ id: string; slug: string }> {
    const existing = await this.prisma.tour.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('That tour could not be found.');

    const slug = await this.uniqueSlug('tour', dto.slug ?? dto.title, id);
    const locationId = await this.resolveLocationId(dto.location);

    // Bullets and plans are positional lists; replacing them wholesale keeps the
    // stored order identical to what the editor shows.
    return this.prisma.$transaction(async (tx) => {
      await tx.tourBullet.deleteMany({ where: { tourId: id } });
      await tx.tourPlan.deleteMany({ where: { tourId: id } });

      return tx.tour.update({
        where: { id },
        data: {
          title: dto.title,
          slug,
          description: dto.description,
          durationHours: dto.durationHours,
          type: dto.type,
          status: dto.published ? 'PUBLISHED' : 'DRAFT',
          locationId,
          priceAdultEur: dto.priceEurMinor,
          priceAdultUsd: dto.priceUsdMinor,
          maxTicketsPerTour: dto.maxTicketsPerTour,
          meetingPointTitle: dto.meetingPointTitle,
          meetingPointAddress: dto.meetingPointAddress,
          bullets: { create: AdminWriteService.bulletRows(dto) },
          plans: {
            create: dto.plans.map((plan, index) => ({
              position: index + 1,
              title: plan.title,
              description: plan.description,
            })),
          },
        },
        select: { id: true, slug: true },
      });
    });
  }

  private static bulletRows(dto: SaveTourDto) {
    const rows: {
      kind: 'HIGHLIGHT' | 'INCLUDED' | 'GOOD_TO_KNOW';
      text: string;
      position: number;
    }[] = [];

    const push = (kind: 'HIGHLIGHT' | 'INCLUDED' | 'GOOD_TO_KNOW', values: string[]) => {
      values
        .map((text) => text.trim())
        .filter(Boolean)
        .forEach((text, position) => rows.push({ kind, text, position }));
    };

    push('HIGHLIGHT', dto.highlights);
    push('INCLUDED', dto.included);
    push('GOOD_TO_KNOW', dto.goodToKnow);
    return rows;
  }

  /**
   * Soft delete. A tour referenced by past bookings must keep existing so those
   * bookings still resolve, so nothing is ever physically removed here.
   */
  async deleteTour(id: string): Promise<void> {
    const tour = await this.prisma.tour.findFirst({ where: { id, deletedAt: null } });
    if (!tour) throw new NotFoundException('That tour could not be found.');

    await this.prisma.tour.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DRAFT' },
    });
  }

  // --- confirmation email ----------------------------------------------------

  /**
   * Re-sends the booking confirmation with the e-tickets attached. Used when a
   * traveller says the original never arrived, so it deliberately rebuilds the
   * documents rather than resending a stored copy.
   */
  async sendConfirmation(reference: string): Promise<{ sentTo: string }> {
    const booking = await this.documents.loadBooking(reference);

    if (booking.status === 'CANCELLED') {
      throw new BusinessException(
        BusinessErrorCode.BookingNotCancellable,
        'That booking is cancelled, so a confirmation cannot be sent.',
      );
    }

    const message = this.documents.confirmationEmail(booking);
    const tickets = await this.documents.ticketPdf(reference);

    await this.mail.send({
      to: booking.customer.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: [
        {
          filename: `${booking.reference}-tickets.pdf`,
          content: tickets.toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    await this.prisma.bookingNote.create({
      data: {
        bookingId: booking.id,
        body: `Confirmation email re-sent to ${booking.customer.email}.`,
      },
    });

    return { sentTo: booking.customer.email };
  }

  // --- tour images -----------------------------------------------------------

  /**
   * Replaces a tour's gallery. Order is the display order and the first image
   * becomes the cover, so the whole list is rewritten rather than patched.
   */
  async setTourImages(tourId: string, dto: SaveTourImagesDto): Promise<void> {
    const tour = await this.prisma.tour.findFirst({
      where: { id: tourId, deletedAt: null },
      select: { id: true, title: true },
    });

    if (!tour) throw new NotFoundException('That tour could not be found.');

    await this.prisma.$transaction([
      this.prisma.tourImage.deleteMany({ where: { tourId } }),
      this.prisma.tourImage.createMany({
        data: dto.urls.map((url, position) => ({
          tourId,
          url,
          alt: tour.title,
          position,
          isCover: position === 0,
        })),
      }),
    ]);
  }

  // --- locations -------------------------------------------------------------

  async createLocation(dto: SaveLocationDto): Promise<{ id: string; name: string }> {
    const existing = await this.prisma.location.findFirst({
      where: { name: dto.name, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      throw new BusinessException(
        BusinessErrorCode.SlugTaken,
        'A location with that name already exists.',
      );
    }

    return this.prisma.location.create({
      data: {
        name: dto.name.trim(),
        country: dto.country.trim(),
        slug: await this.uniqueLocationSlug(dto.name),
      },
      select: { id: true, name: true },
    });
  }

  /**
   * Renaming is a rename, not a re-key: the slug is left alone so that any
   * public destination URL already in circulation keeps working, and tours
   * stay attached because they reference the row by id.
   */
  async updateLocation(id: string, dto: SaveLocationDto): Promise<{ id: string; name: string }> {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!location) {
      throw new NotFoundException('That location could not be found.');
    }

    const clash = await this.prisma.location.findFirst({
      where: { name: dto.name.trim(), deletedAt: null, NOT: { id } },
      select: { id: true },
    });

    if (clash) {
      throw new BusinessException(
        BusinessErrorCode.SlugTaken,
        'A location with that name already exists.',
      );
    }

    return this.prisma.location.update({
      where: { id },
      data: { name: dto.name.trim(), country: dto.country.trim() },
      select: { id: true, name: true },
    });
  }

  /**
   * Soft-deleted, and only while nothing points at it. A tour whose location
   * vanished would render a blank destination on the public site and could not
   * be saved again from the editor, so the count is checked first.
   */
  async deleteLocation(id: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, _count: { select: { tours: { where: { deletedAt: null } } } } },
    });

    if (!location) {
      throw new NotFoundException('That location could not be found.');
    }

    if (location._count.tours > 0) {
      throw new BusinessException(
        BusinessErrorCode.LocationInUse,
        `That location is used by ${location._count.tours} ${
          location._count.tours === 1 ? 'tour' : 'tours'
        }. Move them elsewhere first.`,
      );
    }

    await this.prisma.location.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async uniqueLocationSlug(desired: string): Promise<string> {
    const base = slugify(desired) || 'location';
    let candidate = base;

    for (let attempt = 2; attempt < 100; attempt += 1) {
      const taken = await this.prisma.location.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
      candidate = `${base}-${attempt}`;
    }

    throw new BusinessException(BusinessErrorCode.SlugTaken, 'Could not derive a unique slug.');
  }

  // --- blogs -----------------------------------------------------------------

  async saveBlog(dto: SaveBlogDto, id?: string): Promise<{ id: string; slug: string }> {
    const slug = await this.uniqueSlug('blog', dto.slug ?? dto.title, id);

    const categoryIds = await this.prisma.blogCategory.findMany({
      where: { name: { in: dto.categories } },
      select: { id: true },
    });

    const publishing = dto.status === 'PUBLISHED';

    const data = {
      title: dto.title,
      slug,
      content: dto.content,
      status: dto.status,
      coverImage: dto.coverImage,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
    };

    if (id) {
      const existing = await this.prisma.blog.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, publishedAt: true },
      });

      if (!existing) throw new NotFoundException('That post could not be found.');

      return this.prisma.$transaction(async (tx) => {
        await tx.blogOnCategory.deleteMany({ where: { blogId: id } });

        return tx.blog.update({
          where: { id },
          data: {
            ...data,
            // Stamped once, on first publish — the manual date field was struck.
            publishedAt: publishing ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
            categories: { create: categoryIds.map((category) => ({ categoryId: category.id })) },
          },
          select: { id: true, slug: true },
        });
      });
    }

    return this.prisma.blog.create({
      data: {
        ...data,
        publishedAt: publishing ? new Date() : null,
        categories: { create: categoryIds.map((category) => ({ categoryId: category.id })) },
      },
      select: { id: true, slug: true },
    });
  }

  async deleteBlog(id: string): Promise<void> {
    const blog = await this.prisma.blog.findFirst({ where: { id, deletedAt: null } });
    if (!blog) throw new NotFoundException('That post could not be found.');

    await this.prisma.blog.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DRAFT' },
    });
  }

  // --- bookings --------------------------------------------------------------

  /**
   * Edits a booking's customer details and status.
   *
   * Status changes used to move inventory in both directions — cancelling
   * handed seats back to the departure, reinstating claimed them again under
   * the capacity check. With departures gone there is no inventory to move: a
   * tour cannot sell out, so cancelling frees nothing and reinstating can never
   * be refused.
   */
  async updateBooking(reference: string, dto: UpdateBookingDto): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: { id: true, customerId: true, status: true },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    const changingStatus = dto.status !== undefined && dto.status !== booking.status;

    await this.prisma.$transaction(async (tx) => {
      if (dto.fullName !== undefined || dto.email !== undefined) {
        await tx.customer.update({
          where: { id: booking.customerId },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
            ...(dto.email !== undefined ? { email: dto.email.toLowerCase().trim() } : {}),
          },
        });
      }

      if (changingStatus) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: dto.status,
            cancelledAt: dto.status === 'CANCELLED' ? new Date() : null,
          },
        });
      }
    });
  }

  /**
   * Cancels a booking. There is no inventory to hand back — a tour has no
   * departures and so no seat count — but the guard against cancelling twice
   * stays: it is what tells an operator the button already did its work.
   */
  async cancelBooking(reference: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    if (booking.status === 'CANCELLED') {
      throw new BusinessException(
        BusinessErrorCode.BookingNotCancellable,
        'That booking is already cancelled.',
      );
    }

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  async addNote(reference: string, dto: UpsertNoteDto, authorId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      select: { id: true },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    await this.prisma.bookingNote.create({
      data: { bookingId: booking.id, authorId, body: dto.body.trim() },
    });
  }

  // --- payments --------------------------------------------------------------

  /**
   * Corrects a manually-recorded payment.
   *
   * Refuses anything Stripe owns. That record is written by the webhook, and
   * letting an operator retype the captured amount would make invoices, CSV
   * exports and the revenue figures all claim money that never moved — with no
   * way afterwards to tell which number was the real one.
   *
   * The status is the operator's when they send one and derived from the amount
   * when they do not — deriving it alone could only ever produce PENDING or
   * PAID, so a declined card or a refund handed back in cash had no way of
   * being recorded. Every change is written to the activity log with the
   * previous values.
   *
   * Pay Later is the exception that overrides all of it: no money has moved, so
   * the amount, the receipt number and the payment date are cleared and the
   * record sits PENDING until it is actually settled. Leaving a stale amount on
   * one would put money in the revenue figures that nobody has collected.
   */
  async updatePayment(paymentId: string, dto: UpdatePaymentDto, actorId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { select: { id: true, total: true, reference: true } } },
    });

    if (!payment) throw new NotFoundException('That payment could not be found.');

    if (payment.providerIntentId !== null) {
      throw new BusinessException(
        BusinessErrorCode.PaymentAlreadyCaptured,
        'This payment was captured by Stripe and is its record to keep. Use Refund to return money, or add a booking note to explain a discrepancy.',
      );
    }

    const method = dto.method ?? payment.method;
    const payLater = method === 'PAY_LATER';

    const amountMinor = payLater ? 0 : (dto.amountMinor ?? payment.amount);
    const requestedPaidAt = dto.paidAt ? new Date(dto.paidAt) : payment.paidAt;

    // Derived only as the fallback: an amount short of the booking total is
    // still outstanding unless someone says otherwise on purpose.
    const derived =
      amountMinor > 0 && amountMinor >= payment.booking.total
        ? ('PAID' as const)
        : ('PENDING' as const);

    const status = payLater ? 'PENDING' : (dto.status ?? derived);

    // Only a payment that was actually taken carries a date, and one filed as
    // paid without one is stamped now rather than left reading "not yet". A
    // refund keeps the date the money originally arrived — that it was later
    // returned does not mean it never came in.
    const paidAt =
      status === 'PAID'
        ? (requestedPaidAt ?? new Date())
        : status === 'REFUNDED'
          ? requestedPaidAt
          : null;

    const transactionId = payLater
      ? null
      : dto.transactionId !== undefined
        ? dto.transactionId.trim() || null
        : payment.transactionId;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          method,
          transactionId,
          amount: amountMinor,
          paidAt,
          status,
          // A refund recorded by hand still has to say how much went back, or
          // the refunded totals on the Payments screen stay at zero.
          ...(status === 'REFUNDED'
            ? { refundedAt: payment.refundedAt ?? new Date(), refundedAmount: amountMinor }
            : {}),
        },
      }),
      this.prisma.booking.update({
        where: { id: payment.booking.id },
        data: { paymentStatus: status },
      }),
      this.prisma.activityLog.create({
        data: {
          actorId,
          action: 'payment.updated',
          entity: 'Payment',
          entityId: paymentId,
          metadata: {
            bookingReference: payment.booking.reference,
            before: {
              method: payment.method,
              transactionId: payment.transactionId,
              amountMinor: payment.amount,
              paidAt: payment.paidAt?.toISOString() ?? null,
              status: payment.status,
            },
            after: {
              method,
              transactionId,
              amountMinor,
              paidAt: paidAt?.toISOString() ?? null,
              status,
            },
          },
        },
      }),
    ]);
  }
}
