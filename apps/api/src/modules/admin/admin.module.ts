import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../common/decorators/api-response.decorator';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentsService } from '../documents/documents.service';

import { AdminService } from './admin.service';
import { AdminWriteService } from './admin-write.service';
import {
  SaveBlogDto,
  SaveLocationDto,
  SaveSlotDto,
  SaveTourDto,
  SaveTourImagesDto,
  UpdateBookingDto,
  UpsertNoteDto,
} from './dto/admin-write.dto';
import {
  AdminBlogDto,
  AdminBookingDetailDto,
  AdminBookingDto,
  AdminPaymentDto,
  AdminTourDto,
  DashboardStatsDto,
  ListAdminBlogsQueryDto,
  ListAdminBookingsQueryDto,
  ListAdminToursQueryDto,
} from './dto/admin.dto';

/**
 * Everything the admin panel reads.
 *
 * The whole controller is role-gated: `JwtAuthGuard` runs globally and closes
 * these routes by default (no `@Public()`), and `RolesGuard` then narrows them
 * to staff.
 */
@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@Roles('ADMIN', 'EDITOR')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly write: AdminWriteService,
    private readonly documents: DocumentsService,
  ) {}

  // --- dashboard -------------------------------------------------------------

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Headline figures for the dashboard' })
  @ApiEnvelopeResponse(DashboardStatsDto)
  stats(): Promise<DashboardStatsDto> {
    return this.admin.dashboardStats();
  }

  @Get('dashboard/bookings-series')
  @ApiOperation({ summary: 'Bookings per day' })
  series() {
    return this.admin.bookingsSeries();
  }

  @Get('dashboard/status-breakdown')
  @ApiOperation({ summary: 'Bookings by status' })
  breakdown() {
    return this.admin.statusBreakdown();
  }

  @Get('dashboard/top-tours')
  @ApiOperation({ summary: 'Most-booked tours' })
  topTours() {
    return this.admin.topTours();
  }

  @Get('dashboard/recent-bookings')
  @ApiOperation({ summary: 'Latest bookings' })
  recent() {
    return this.admin.recentBookings();
  }

  // --- tours -----------------------------------------------------------------

  @Get('tours/stats')
  @ApiOperation({ summary: 'Tour totals' })
  tourStats() {
    return this.admin.tourStats();
  }

  @Get('tours')
  @ApiOperation({ summary: 'Every tour, including drafts' })
  @ApiPaginatedResponse(AdminTourDto)
  listTours(@Query() query: ListAdminToursQueryDto) {
    return this.admin.listTours(query);
  }

  @Get('blog-categories')
  @ApiOperation({ summary: 'Blog categories' })
  blogCategories() {
    return this.admin.blogCategories();
  }

  @Get('locations')
  @ApiOperation({ summary: 'Destinations' })
  locations() {
    return this.admin.locations();
  }

  @Get('tours/:id')
  @ApiOperation({ summary: 'One tour, in editor shape' })
  tourDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.tourDetail(id);
  }

  @Get('tours/:id/slots')
  @ApiOperation({ summary: 'Departures for a tour on one date' })
  tourSlots(@Param('id', ParseUUIDPipe) id: string, @Query('date') date?: string) {
    return this.admin.tourSlots(id, date);
  }

  // --- bookings --------------------------------------------------------------

  @Get('bookings/stats')
  @ApiOperation({ summary: 'Booking totals' })
  bookingStats() {
    return this.admin.bookingStats();
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Every booking' })
  @ApiPaginatedResponse(AdminBookingDto)
  listBookings(@Query() query: ListAdminBookingsQueryDto) {
    return this.admin.listBookings(query);
  }

  /**
   * Declared before `bookings/:reference` — Nest matches in declaration order,
   * so the parameterised route would otherwise treat "export" as a reference.
   */
  @Get('bookings/export')
  @ApiOperation({ summary: 'Export bookings as CSV' })
  @ApiProduces('text/csv')
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'Booked on or after, YYYY-MM-DD.' })
  @ApiQuery({ name: 'to', required: false, description: 'Booked on or before, YYYY-MM-DD.' })
  async exportBookings(
    @Res({ passthrough: true }) response: Response,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StreamableFile> {
    const csv = await this.documents.bookingsCsv({ search, status, from, to });

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');

    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }

  @Get('bookings/:reference')
  @ApiOperation({ summary: 'A single booking with items, tickets and payment' })
  @ApiEnvelopeResponse(AdminBookingDetailDto)
  booking(@Param('reference') reference: string): Promise<AdminBookingDetailDto> {
    return this.admin.bookingByReference(reference);
  }

  // --- blogs -----------------------------------------------------------------

  @Get('blogs/stats')
  @ApiOperation({ summary: 'Blog totals' })
  blogStats() {
    return this.admin.blogStats();
  }

  @Get('blogs')
  @ApiOperation({ summary: 'Every blog post, including drafts' })
  @ApiPaginatedResponse(AdminBlogDto)
  listBlogs(@Query() query: ListAdminBlogsQueryDto) {
    return this.admin.listBlogs(query);
  }

  // --- payments --------------------------------------------------------------

  @Get('blogs/:id')
  @ApiOperation({ summary: 'One post, in editor shape' })
  blogDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.blogDetail(id);
  }

  @Get('payments/stats')
  @ApiOperation({ summary: 'Payment totals' })
  paymentStats() {
    return this.admin.paymentStats();
  }

  @Get('payments')
  @ApiOperation({ summary: 'Every payment' })
  @ApiPaginatedResponse(AdminPaymentDto)
  listPayments(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.listPayments(
      Number.parseInt(page ?? '1', 10) || 1,
      Number.parseInt(limit ?? '10', 10) || 10,
    );
  }

  // --- writes ----------------------------------------------------------------

  @Post('tours')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tour' })
  createTour(@Body() dto: SaveTourDto) {
    return this.write.createTour(dto);
  }

  @Patch('tours/:id')
  @ApiOperation({ summary: 'Update a tour' })
  updateTour(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveTourDto) {
    return this.write.updateTour(id, dto);
  }

  @Delete('tours/:id')
  @ApiOperation({ summary: 'Soft-delete a tour' })
  async deleteTour(@Param('id', ParseUUIDPipe) id: string) {
    await this.write.deleteTour(id);
    return { message: 'Tour deleted.' };
  }

  @Put('tours/:id/images')
  @ApiOperation({ summary: 'Replace a tour gallery' })
  async setTourImages(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveTourImagesDto) {
    await this.write.setTourImages(id, dto);
    return { message: 'Gallery updated.' };
  }

  @Post('tours/:id/slots')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a departure time' })
  createSlot(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveSlotDto) {
    return this.write.createSlot(id, dto);
  }

  @Patch('slots/:slotId')
  @ApiOperation({ summary: 'Change a departure time or its capacity' })
  async updateSlot(@Param('slotId', ParseUUIDPipe) slotId: string, @Body() dto: SaveSlotDto) {
    await this.write.updateSlot(slotId, dto);
    return { message: 'Time slot updated.' };
  }

  @Delete('slots/:slotId')
  @ApiOperation({ summary: 'Remove a departure with no bookings' })
  async deleteSlot(@Param('slotId', ParseUUIDPipe) slotId: string) {
    await this.write.deleteSlot(slotId);
    return { message: 'Time slot removed.' };
  }

  @Post('locations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a destination' })
  createLocation(@Body() dto: SaveLocationDto) {
    return this.write.createLocation(dto);
  }

  @Post('blogs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a blog post' })
  createBlog(@Body() dto: SaveBlogDto) {
    return this.write.saveBlog(dto);
  }

  @Patch('blogs/:id')
  @ApiOperation({ summary: 'Update a blog post' })
  updateBlog(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveBlogDto) {
    return this.write.saveBlog(dto, id);
  }

  @Delete('blogs/:id')
  @ApiOperation({ summary: 'Soft-delete a blog post' })
  async deleteBlog(@Param('id', ParseUUIDPipe) id: string) {
    await this.write.deleteBlog(id);
    return { message: 'Post deleted.' };
  }

  @Patch('bookings/:reference')
  @ApiOperation({ summary: 'Update a booking and its customer' })
  async updateBooking(@Param('reference') reference: string, @Body() dto: UpdateBookingDto) {
    await this.write.updateBooking(reference, dto);
    return { message: 'Booking updated.' };
  }

  @Post('bookings/:reference/cancel')
  @ApiOperation({ summary: 'Cancel a booking and release its seats' })
  async cancelBooking(@Param('reference') reference: string) {
    await this.write.cancelBooking(reference);
    return { message: 'Booking cancelled and seats released.' };
  }

  @Post('bookings/:reference/send-confirmation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-send the confirmation email with e-tickets attached' })
  sendConfirmation(@Param('reference') reference: string) {
    return this.write.sendConfirmation(reference);
  }

  @Post('bookings/:reference/notes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an internal note to a booking' })
  async addNote(
    @Param('reference') reference: string,
    @Body() dto: UpsertNoteDto,
    @CurrentUser('id') userId: string,
  ) {
    await this.write.addNote(reference, dto, userId);
    return { message: 'Note added.' };
  }
}

@Module({
  imports: [DocumentsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminWriteService],
})
export class AdminModule {}
