import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { jwtConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';

import { DocumentsService } from './documents.service';

interface LookupTokenPayload {
  email: string;
  typ: string;
}

/**
 * Guards the traveller's own documents.
 *
 * A booking reference is printed on emails and screens, so it is an identifier
 * and not a secret. Every document therefore requires the same signed,
 * short-lived token that gates the booking lookup itself, and the booking must
 * belong to the address inside that token.
 */
@Injectable()
export class TravellerDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly jwt: JwtService,
    @Inject(jwtConfig.KEY) private readonly jwtSettings: ConfigType<typeof jwtConfig>,
  ) {}

  private async authorise(reference: string, token: string): Promise<void> {
    const secret = this.jwtSettings.accessSecret;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured.');

    let email: string;

    try {
      const payload = this.jwt.verify<LookupTokenPayload>(token, { secret });
      if (payload.typ !== 'booking-lookup') throw new Error('wrong token type');
      email = payload.email;
    } catch {
      throw new UnauthorizedException('That link is invalid or has expired.');
    }

    const booking = await this.prisma.booking.findFirst({
      where: { reference, deletedAt: null, customer: { email } },
      select: { id: true },
    });

    // Deliberately the same error whether the booking does not exist or belongs
    // to somebody else: otherwise this would confirm which references are real.
    if (!booking) {
      throw new NotFoundException('That booking could not be found.');
    }
  }

  async ticketPdf(reference: string, token: string): Promise<Buffer> {
    await this.authorise(reference, token);
    return this.documents.ticketPdf(reference);
  }

  async invoicePdf(reference: string, token: string): Promise<Buffer> {
    await this.authorise(reference, token);
    return this.documents.invoicePdf(reference);
  }
}
