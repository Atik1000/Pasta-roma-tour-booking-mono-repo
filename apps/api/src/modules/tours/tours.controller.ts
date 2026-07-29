import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import {
  AvailabilityDayDto,
  AvailabilityQueryDto,
  ListToursQueryDto,
  SlotDto,
  SlotQueryDto,
  TourDetailDto,
  TourSummaryDto,
} from './dto/tour.dto';
import { ToursService } from './tours.service';

@ApiTags('Tours')
@Controller('tours')
@Public()
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Get()
  @ApiOperation({ summary: 'Search published tours' })
  @ApiPaginatedResponse(TourSummaryDto)
  list(@Query() query: ListToursQueryDto) {
    return this.tours.list(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'A single published tour' })
  @ApiEnvelopeResponse(TourDetailDto)
  findOne(@Param('slug') slug: string): Promise<TourDetailDto> {
    return this.tours.findBySlug(slug);
  }

  @Get(':slug/related')
  @ApiOperation({ summary: 'Other tours to show alongside this one' })
  @ApiEnvelopeResponse(TourSummaryDto)
  related(@Param('slug') slug: string): Promise<TourSummaryDto[]> {
    return this.tours.related(slug);
  }

  @Get(':slug/slots')
  @ApiOperation({ summary: 'Departure times for one date' })
  @ApiEnvelopeResponse(SlotDto)
  slots(@Param('slug') slug: string, @Query() query: SlotQueryDto): Promise<SlotDto[]> {
    return this.tours.slotsForDate(slug, query.date);
  }

  @Get(':slug/availability')
  @ApiOperation({ summary: 'Day-by-day availability for the date rail' })
  @ApiEnvelopeResponse(AvailabilityDayDto)
  availability(
    @Param('slug') slug: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<AvailabilityDayDto[]> {
    return this.tours.availability(slug, query.from, query.days);
  }
}
