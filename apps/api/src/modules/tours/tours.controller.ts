import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrencyQueryDto } from '../../common/dto/currency-query.dto';
import { ListToursQueryDto, TourDetailDto, TourSummaryDto } from './dto/tour.dto';
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
  findOne(@Param('slug') slug: string, @Query() query: CurrencyQueryDto): Promise<TourDetailDto> {
    return this.tours.findBySlug(slug, query.currency);
  }

  @Get(':slug/related')
  @ApiOperation({ summary: 'Other tours to show alongside this one' })
  @ApiEnvelopeResponse(TourSummaryDto)
  related(
    @Param('slug') slug: string,
    @Query() query: CurrencyQueryDto,
  ): Promise<TourSummaryDto[]> {
    return this.tours.related(slug, query.currency);
  }
}
