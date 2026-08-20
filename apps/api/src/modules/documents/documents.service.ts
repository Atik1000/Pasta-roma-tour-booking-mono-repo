import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { toBuffer as qrToBuffer } from 'qrcode';

import { appConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

/** Brand colours, lifted from the design tokens so documents match the site. */
const GOLD = '#b5751f';
const INK = '#2b2016';
const MUTED = '#8a7c6d';
const RULE = '#e6dccd';

const PAGE_MARGIN = 48;

/** Minor units to a display string. Intl is overkill for two currencies. */
function money(minor: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : '€';
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

function longDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** RFC 4180: quote anything containing a comma, quote or newline. */
function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

type BookingRecord = NonNullable<Awaited<ReturnType<DocumentsService['loadBooking']>>>;

/**
 * Invoices, e-tickets and exports.
 *
 * PDFs are drawn directly rather than rendered from HTML: there is no headless
 * browser to run, the output is deterministic, and a document can be produced
 * inside a queue worker with no display server.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /** The booking plus everything a document needs, in one query. */
  async loadBooking(reference: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null },
      include: {
        customer: true,
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            tickets: { orderBy: { createdAt: 'asc' } },
            tour: {
              select: {
                meetingPointTitle: true,
                meetingPointAddress: true,
                location: { select: { name: true } },
              },
            },
          },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!booking) throw new NotFoundException('That booking could not be found.');

    return booking;
  }

  // --- invoice ---------------------------------------------------------------

  async invoicePdf(reference: string): Promise<Buffer> {
    const booking = await this.loadBooking(reference);
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    this.header(doc, 'INVOICE');

    const right = doc.page.width - PAGE_MARGIN;
    let y = 150;

    doc.fontSize(9).fillColor(MUTED).text('BILLED TO', PAGE_MARGIN, y);
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .text('INVOICE DETAILS', right - 200, y, { width: 200, align: 'right' });

    y += 14;
    doc.fontSize(11).fillColor(INK).text(booking.customer.fullName, PAGE_MARGIN, y);
    doc
      .fontSize(10)
      .fillColor(INK)
      .text(`Invoice ${booking.reference}`, right - 200, y, { width: 200, align: 'right' });

    y += 15;
    doc.fontSize(10).fillColor(MUTED).text(booking.customer.email, PAGE_MARGIN, y);
    doc
      .fontSize(10)
      .fillColor(MUTED)
      .text(`Issued ${longDate(booking.bookedAt)}`, right - 200, y, { width: 200, align: 'right' });

    if (booking.customer.phone) {
      y += 15;
      doc.fontSize(10).fillColor(MUTED).text(booking.customer.phone, PAGE_MARGIN, y);
    }

    y += 15;
    doc
      .fontSize(10)
      .fillColor(booking.paymentStatus === 'PAID' ? '#2f7d4f' : MUTED)
      .text(`Payment: ${booking.paymentStatus}`, right - 200, y, { width: 200, align: 'right' });

    // --- line items
    y += 40;
    const columns = { tour: PAGE_MARGIN, qty: 370, unit: 415, amount: right - 70 };

    doc.fontSize(9).fillColor(MUTED);
    doc.text('TOUR', columns.tour, y);
    doc.text('QTY', columns.qty, y, { width: 30, align: 'right' });
    doc.text('UNIT', columns.unit, y, { width: 50, align: 'right' });
    doc.text('AMOUNT', columns.amount, y, { width: 70, align: 'right' });

    y += 14;
    doc.moveTo(PAGE_MARGIN, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
    y += 12;

    for (const item of booking.items) {
      doc.fontSize(10).fillColor(INK);
      // The title now has the width the departure column used to take.
      const titleHeight = doc.heightOfString(item.tourTitle, { width: 330 });
      doc.text(item.tourTitle, columns.tour, y, { width: 330 });
      doc.text(String(item.quantity), columns.qty, y, { width: 30, align: 'right' });
      doc.text(money(item.unitPrice, booking.currency), columns.unit, y, {
        width: 50,
        align: 'right',
      });
      doc.text(money(item.amount, booking.currency), columns.amount, y, {
        width: 70,
        align: 'right',
      });

      y += Math.max(titleHeight, 14) + 10;

      if (y > doc.page.height - 200) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }

    doc.moveTo(PAGE_MARGIN, y).lineTo(right, y).strokeColor(RULE).stroke();
    y += 14;

    const totalRow = (label: string, value: string, bold = false) => {
      doc.fontSize(bold ? 12 : 10).fillColor(bold ? INK : MUTED);
      doc.text(label, columns.unit - 90, y, { width: 140, align: 'right' });
      doc.fillColor(bold ? GOLD : INK);
      doc.text(value, columns.amount, y, { width: 70, align: 'right' });
      y += bold ? 20 : 16;
    };

    totalRow('Subtotal', money(booking.subtotal, booking.currency));
    if (booking.bookingFee > 0) {
      totalRow('Booking fee', money(booking.bookingFee, booking.currency));
    }
    totalRow('Total', money(booking.total, booking.currency), true);

    const payment = booking.payments[0];
    if (payment) {
      y += 6;
      doc
        .fontSize(9)
        .fillColor(MUTED)
        .text(
          `Paid by ${payment.method.toLowerCase().replace(/_/g, ' ')}${
            payment.providerIntentId ? ` · ${payment.providerIntentId}` : ''
          }`,
          PAGE_MARGIN,
          y,
        );
    }

    this.footer(doc, 'This invoice was generated automatically and is valid without a signature.');

    doc.end();
    return this.collect(doc, chunks);
  }

  // --- e-ticket --------------------------------------------------------------

  /**
   * One page per ticket. Each carries its own scannable code, because tickets
   * are admitted individually at the meeting point.
   */
  async ticketPdf(reference: string): Promise<Buffer> {
    const booking = await this.loadBooking(reference);
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const tickets = booking.items.flatMap((item) =>
      item.tickets.map((ticket) => ({ item, ticket })),
    );

    if (tickets.length === 0) {
      this.header(doc, 'E-TICKET');
      doc
        .fontSize(12)
        .fillColor(INK)
        .text(
          `Booking ${booking.reference} has no tickets issued yet. Tickets are issued once payment is confirmed.`,
          PAGE_MARGIN,
          160,
          { width: doc.page.width - PAGE_MARGIN * 2 },
        );
      doc.end();
      return this.collect(doc, chunks);
    }

    for (const [index, { item, ticket }] of tickets.entries()) {
      if (index > 0) doc.addPage();
      await this.ticketPage(doc, booking, item, ticket, index + 1, tickets.length);
    }

    doc.end();
    return this.collect(doc, chunks);
  }

  private async ticketPage(
    doc: PDFKit.PDFDocument,
    booking: BookingRecord,
    item: BookingRecord['items'][number],
    ticket: BookingRecord['items'][number]['tickets'][number],
    position: number,
    count: number,
  ): Promise<void> {
    const right = doc.page.width - PAGE_MARGIN;
    const width = right - PAGE_MARGIN;

    this.header(doc, 'E-TICKET');

    doc
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Ticket ${position} of ${count}`, PAGE_MARGIN, 118, { width, align: 'right' });

    // Gold banner carrying the tour.
    doc.roundedRect(PAGE_MARGIN, 140, width, 92, 10).fill(GOLD);
    doc
      .fillColor('#ffffff')
      .fontSize(18)
      .text(item.tourTitle, PAGE_MARGIN + 20, 160, { width: width - 40 });
    doc
      .fontSize(11)
      .fillColor('#fdf6e9')
      // Tours are booked on demand, so a ticket names the booking rather than a
      // departure — the date is arranged with the traveller afterwards.
      .text(`Booking ${booking.reference}`, PAGE_MARGIN + 20, 196, { width: width - 40 });

    let y = 262;

    const field = (label: string, value: string, column: 0 | 1) => {
      const x = column === 0 ? PAGE_MARGIN : PAGE_MARGIN + width / 2;
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(label.toUpperCase(), x, y, { width: width / 2 - 10 });
      doc
        .fontSize(12)
        .fillColor(INK)
        .text(value, x, y + 12, { width: width / 2 - 10 });
    };

    field('Traveller', `${ticket.holderFirstName} ${ticket.holderLastName}`, 0);
    field('Booking reference', booking.reference, 1);
    y += 46;

    field('Meeting point', item.tour.meetingPointTitle ?? item.tour.location.name, 0);
    field('Status', booking.status, 1);
    y += 46;

    if (item.tour.meetingPointAddress) {
      doc.fontSize(8).fillColor(MUTED).text('ADDRESS', PAGE_MARGIN, y);
      doc
        .fontSize(11)
        .fillColor(INK)
        .text(item.tour.meetingPointAddress, PAGE_MARGIN, y + 12, { width: width * 0.6 });
      y += 46;
    }

    // The scannable code is the whole point of the document — give it room.
    const qr = await qrToBuffer(ticket.code, {
      width: 320,
      margin: 1,
      color: { dark: INK, light: '#ffffff' },
    });

    y += 10;
    doc.image(qr, PAGE_MARGIN, y, { width: 150 });
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .text('Present this code at the meeting point.', PAGE_MARGIN + 168, y + 46, { width: 220 });
    doc
      .fontSize(14)
      .fillColor(INK)
      .text(ticket.code, PAGE_MARGIN + 168, y + 66, { width: 260 });

    this.footer(doc, 'We will be in touch to arrange a time. This ticket admits one traveller.');
  }

  // --- CSV export ------------------------------------------------------------

  /**
   * One row per booking, honouring the same filters as the bookings table so
   * an export always matches what the operator is looking at.
   */
  /**
   * The bookings table as CSV.
   *
   * Takes the same filter set as the listing, so the export always matches what
   * the operator was looking at when they pressed the button.
   */
  async bookingsCsv(filters: {
    search?: string;
    status?: string;
    paymentStatus?: string;
    tourId?: string;
    minAmountMinor?: number;
    maxAmountMinor?: number;
    from?: string;
    to?: string;
  }): Promise<string> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        ...(filters.status && filters.status !== 'ALL'
          ? { status: filters.status as 'CONFIRMED' | 'PENDING' | 'CANCELLED' }
          : {}),
        ...(filters.paymentStatus && filters.paymentStatus !== 'ALL'
          ? {
              paymentStatus: filters.paymentStatus as 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED',
            }
          : {}),
        ...(filters.tourId ? { items: { some: { tourId: filters.tourId } } } : {}),
        ...(filters.minAmountMinor !== undefined || filters.maxAmountMinor !== undefined
          ? {
              total: {
                ...(filters.minAmountMinor !== undefined ? { gte: filters.minAmountMinor } : {}),
                ...(filters.maxAmountMinor !== undefined ? { lte: filters.maxAmountMinor } : {}),
              },
            }
          : {}),
        ...(filters.search
          ? {
              OR: [
                { reference: { contains: filters.search, mode: 'insensitive' as const } },
                {
                  customer: {
                    fullName: { contains: filters.search, mode: 'insensitive' as const },
                  },
                },
                { customer: { email: { contains: filters.search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
        ...(filters.from || filters.to
          ? {
              bookedAt: {
                ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
                ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: { bookedAt: 'desc' },
      include: { customer: true, items: true },
    });

    const header = [
      'Reference',
      'Booked At',
      'Customer',
      'Email',
      'Phone',
      'Status',
      'Payment Status',
      'Currency',
      'Subtotal',
      'Booking Fee',
      'Total',
      'Tickets',
      'Tours',
    ];

    const rows = bookings.map((booking) =>
      [
        booking.reference,
        booking.bookedAt.toISOString(),
        booking.customer.fullName,
        booking.customer.email,
        booking.customer.phone ?? '',
        booking.status,
        booking.paymentStatus,
        booking.currency,
        // Major units: a spreadsheet reader expects 118.00, not 11800.
        (booking.subtotal / 100).toFixed(2),
        (booking.bookingFee / 100).toFixed(2),
        (booking.total / 100).toFixed(2),
        booking.items.reduce((sum, item) => sum + item.quantity, 0),
        booking.items.map((item) => `${item.tourTitle} × ${item.quantity}`).join('; '),
      ]
        .map(csvCell)
        .join(','),
    );

    // A BOM so Excel reads the file as UTF-8 rather than the local codepage —
    // without it, accented tour names arrive mangled.
    return `\uFEFF${[header.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`;
  }

  // --- confirmation email ----------------------------------------------------

  /** The confirmation body, shared by checkout and the admin resend button. */
  confirmationEmail(booking: BookingRecord): { subject: string; html: string; text: string } {
    const lines = booking.items
      .map(
        (item) =>
          `<tr>
             <td style="padding:10px 0;border-bottom:1px solid ${RULE}">
               <strong style="color:${INK}">${escapeHtml(item.tourTitle)}</strong><br />
               <span style="color:${MUTED};font-size:13px">${item.quantity} ticket(s)</span>
             </td>
             <td style="padding:10px 0;border-bottom:1px solid ${RULE};text-align:right;color:${INK}">
               ${money(item.amount, booking.currency)}
             </td>
           </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:${INK}">
        <h1 style="color:${GOLD};font-size:22px;margin:0 0 4px">Pasta Roma Tour</h1>
        <p style="color:${MUTED};margin:0 0 24px">Booking confirmation</p>

        <p>Hello ${escapeHtml(booking.customer.fullName)},</p>
        <p>Your booking <strong>${booking.reference}</strong> is confirmed. Your tickets are attached to this email.</p>

        <table style="width:100%;border-collapse:collapse;margin:24px 0">${lines}
          <tr>
            <td style="padding:12px 0;font-weight:600">Total</td>
            <td style="padding:12px 0;text-align:right;font-weight:600;color:${GOLD}">
              ${money(booking.total, booking.currency)}
            </td>
          </tr>
        </table>

        <p style="color:${MUTED};font-size:13px">
          We will be in touch to arrange a time. Please bring the attached ticket.
        </p>
        <p style="color:${MUTED};font-size:13px">
          <a href="${this.config.siteUrl}/my-bookings" style="color:${GOLD}">Manage your bookings</a>
        </p>
      </div>
    `;

    const text = [
      `Your booking ${booking.reference} is confirmed.`,
      ...booking.items.map((item) => `- ${item.tourTitle}, ${item.quantity} ticket(s)`),
      `Total: ${money(booking.total, booking.currency)}`,
      `Manage your bookings: ${this.config.siteUrl}/my-bookings`,
    ].join('\n');

    return { subject: `Your Pasta Roma Tour booking ${booking.reference}`, html, text };
  }

  // --- shared chrome ---------------------------------------------------------

  private header(doc: PDFKit.PDFDocument, kind: string): void {
    const right = doc.page.width - PAGE_MARGIN;

    doc.fontSize(20).fillColor(GOLD).text('Pasta Roma Tour', PAGE_MARGIN, PAGE_MARGIN);
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .text('Guided tours across Italy', PAGE_MARGIN, PAGE_MARGIN + 26);

    doc
      .fontSize(16)
      .fillColor(INK)
      .text(kind, right - 200, PAGE_MARGIN + 4, { width: 200, align: 'right' });

    doc
      .moveTo(PAGE_MARGIN, PAGE_MARGIN + 56)
      .lineTo(right, PAGE_MARGIN + 56)
      .strokeColor(GOLD)
      .lineWidth(2)
      .stroke();
  }

  private footer(doc: PDFKit.PDFDocument, note: string): void {
    const bottom = doc.page.height - PAGE_MARGIN - 24;

    doc
      .moveTo(PAGE_MARGIN, bottom)
      .lineTo(doc.page.width - PAGE_MARGIN, bottom)
      .strokeColor(RULE)
      .lineWidth(1)
      .stroke();

    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(note, PAGE_MARGIN, bottom + 8, {
        width: doc.page.width - PAGE_MARGIN * 2,
      });
  }

  /** pdfkit streams; this resolves once the last chunk has landed. */
  private collect(doc: PDFKit.PDFDocument, chunks: Buffer[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
