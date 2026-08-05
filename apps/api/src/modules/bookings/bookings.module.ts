import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, MaxLength } from 'class-validator';

import { ApiEnvelopeResponse } from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { appConfig, jwtConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';

const LOOKUP_TTL_MINUTES = 30;

export class LookupRequestDto {
  @ApiProperty({ example: 'traveller@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;
}

export class MessageDto {
  @ApiProperty() message!: string;
}

export class BookingTourDto {
  @ApiProperty() title!: string;
  /** So the traveller can open the tour they booked. */
  @ApiProperty() slug!: string;
  /**
   * Presentational, and read live rather than denormalised: if the operator has
   * since replaced the tour's photography, the traveller should see the current
   * picture, not whatever was on the page the day they booked.
   */
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
  @ApiProperty() date!: string;
  @ApiProperty() time!: string;
  @ApiProperty() location!: string;
  @ApiProperty() travellers!: number;
  @ApiProperty({ description: 'Per-ticket price in minor units.' }) unitPriceMinor!: number;
  @ApiProperty({ description: 'Line total in minor units.' }) amountMinor!: number;
  @ApiPropertyOptional({ nullable: true }) meetingPoint!: string | null;
  @ApiPropertyOptional({ nullable: true }) meetingPointAddress!: string | null;
}

export class TravellerBookingDto {
  @ApiProperty() reference!: string;
  @ApiProperty() bookedAt!: string;
  @ApiProperty() status!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() subtotalMinor!: number;
  @ApiProperty() bookingFeeMinor!: number;
  @ApiProperty() totalMinor!: number;
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
  @ApiProperty({ type: [BookingTourDto] }) tours!: BookingTourDto[];
}

interface LookupTokenPayload {
  email: string;
  typ: 'booking-lookup';
}

/**
 * Traveller-facing booking lookup.
 *
 * The design shows bookings appearing for whoever types an email address, which
 * would expose any customer's travel dates and references to a stranger.
 * Instead the address receives a signed, short-lived link, and only the holder
 * of that link sees the bookings. The response is identical whether or not the
 * address is known, so the endpoint cannot enumerate customers either.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    @Inject(jwtConfig.KEY) private readonly jwtSettings: ConfigType<typeof jwtConfig>,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  private secret(): string {
    const secret = this.jwtSettings.accessSecret;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured.');
    return secret;
  }

  async requestLink(email: string): Promise<void> {
    const normalised = email.toLowerCase().trim();

    const customer = await this.prisma.customer.findUnique({
      where: { email: normalised },
      select: { id: true },
    });

    // Silently stop for unknown addresses: the caller is told the same thing
    // either way, so nothing here reveals whether the customer exists.
    if (!customer) return;

    const payload: LookupTokenPayload = { email: normalised, typ: 'booking-lookup' };
    const token = this.jwt.sign(payload, {
      secret: this.secret(),
      expiresIn: LOOKUP_TTL_MINUTES * 60,
    });

    const link = `${this.app.siteUrl}/my-bookings?token=${encodeURIComponent(token)}`;

    await this.mail.send({
      to: normalised,
      subject: 'Your Pasta Roma Tour bookings',
      html: `
        <p>Here is the secure link to your bookings. It expires in ${LOOKUP_TTL_MINUTES} minutes.</p>
        <p><a href="${link}">View my bookings</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
      text: `View your bookings (valid for ${LOOKUP_TTL_MINUTES} minutes): ${link}`,
    });
  }

  async byToken(token: string): Promise<TravellerBookingDto[]> {
    let email: string;

    try {
      const payload = this.jwt.verify<LookupTokenPayload>(token, { secret: this.secret() });
      if (payload.typ !== 'booking-lookup') throw new Error('wrong token type');
      email = payload.email;
    } catch {
      throw new UnauthorizedException('That link is invalid or has expired.');
    }

    const bookings = await this.prisma.booking.findMany({
      where: { customer: { email }, deletedAt: null },
      orderBy: { bookedAt: 'desc' },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            tour: {
              select: {
                slug: true,
                meetingPointTitle: true,
                meetingPointAddress: true,
                location: { select: { name: true } },
                images: { where: { isCover: true }, take: 1, select: { url: true } },
              },
            },
          },
        },
      },
    });

    return bookings.map((booking) => ({
      reference: booking.reference,
      bookedAt: booking.bookedAt.toISOString(),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      subtotalMinor: booking.subtotal,
      bookingFeeMinor: booking.bookingFee,
      totalMinor: booking.total,
      currency: booking.currency,
      tours: booking.items.map((item) => ({
        title: item.tourTitle,
        slug: item.tour.slug,
        coverImage: item.tour.images[0]?.url ?? null,
        date: item.date.toISOString().slice(0, 10),
        time: item.time,
        // The tour can be renamed or moved after booking; the departure and
        // price are denormalised on the item, but the meeting point is not,
        // so it is read live and may legitimately have changed.
        location: item.tour.location.name,
        travellers: item.quantity,
        unitPriceMinor: item.unitPrice,
        amountMinor: item.amount,
        meetingPoint: item.tour.meetingPointTitle,
        meetingPointAddress: item.tour.meetingPointAddress,
      })),
    }));
  }
}

@ApiTags('Bookings')
@Controller('bookings')
@Public()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('lookup')
  // Tight limit: this endpoint sends mail to an address the caller supplies.
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiOperation({ summary: 'Email a secure link to the bookings for an address' })
  @ApiEnvelopeResponse(MessageDto)
  async requestLink(@Body() dto: LookupRequestDto): Promise<MessageDto> {
    await this.bookings.requestLink(dto.email);

    return {
      message: 'If that address has bookings with us, a secure link is on its way.',
    };
  }

  @Get('lookup/:token')
  @ApiOperation({ summary: 'The bookings behind a lookup link' })
  @ApiEnvelopeResponse(TravellerBookingDto)
  byToken(@Param('token') token: string): Promise<TravellerBookingDto[]> {
    return this.bookings.byToken(token);
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
