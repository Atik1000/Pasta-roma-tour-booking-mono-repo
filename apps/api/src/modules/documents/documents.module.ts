import { Controller, Get, Header, Module, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public, Roles } from '../../common/decorators/auth.decorators';

import { DocumentsService } from './documents.service';
import { TravellerDocumentsService } from './traveller-documents.service';

/** A filename that survives a Content-Disposition header unescaped. */
function safeName(reference: string, kind: string, extension: string): string {
  return `${reference.replace(/[^A-Za-z0-9-]/g, '')}-${kind}.${extension}`;
}

@ApiTags('Documents')
@ApiBearerAuth('access-token')
@Controller('admin')
@Roles('ADMIN', 'EDITOR')
export class AdminDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('bookings/:reference/invoice')
  @ApiOperation({ summary: 'Invoice PDF for one booking' })
  @ApiProduces('application/pdf')
  async invoice(
    @Param('reference') reference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.documents.invoicePdf(reference);

    response.setHeader('Content-Type', 'application/pdf');
    // `inline` so the admin's Print Invoice opens the print dialog rather than
    // dropping a file in Downloads.
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${safeName(reference, 'invoice', 'pdf')}"`,
    );

    return new StreamableFile(pdf);
  }

  @Get('bookings/:reference/tickets')
  @ApiOperation({ summary: 'E-tickets PDF for one booking' })
  @ApiProduces('application/pdf')
  async tickets(
    @Param('reference') reference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.documents.ticketPdf(reference);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName(reference, 'tickets', 'pdf')}"`,
    );

    return new StreamableFile(pdf);
  }
}

/**
 * The traveller's own copy.
 *
 * Public in the sense that no admin session is needed, but every route still
 * demands the signed lookup token that was emailed to the booking's address —
 * a reference alone is not an authorisation.
 */
@ApiTags('Documents')
@Controller('bookings')
@Public()
export class TravellerDocumentsController {
  constructor(private readonly traveller: TravellerDocumentsService) {}

  @Get(':reference/tickets')
  @ApiOperation({ summary: 'Download your own e-tickets' })
  @ApiProduces('application/pdf')
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'The signed lookup token from your email.',
  })
  @Header('Cache-Control', 'no-store')
  async tickets(
    @Param('reference') reference: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.traveller.ticketPdf(reference, token);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName(reference, 'tickets', 'pdf')}"`,
    );

    return new StreamableFile(pdf);
  }

  @Get(':reference/invoice')
  @ApiOperation({ summary: 'Download your own invoice' })
  @ApiProduces('application/pdf')
  @ApiQuery({ name: 'token', required: true })
  @Header('Cache-Control', 'no-store')
  async invoice(
    @Param('reference') reference: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.traveller.invoicePdf(reference, token);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName(reference, 'invoice', 'pdf')}"`,
    );

    return new StreamableFile(pdf);
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminDocumentsController, TravellerDocumentsController],
  providers: [DocumentsService, TravellerDocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
