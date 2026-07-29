import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { ApiEnvelopeResponse } from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../database/prisma.service';

export class LocationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() country!: string;
  @ApiProperty({ description: 'Number of published tours in this location.' })
  tourCount!: number;
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<LocationDto[]> {
    const rows = await this.prisma.location.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tours: { where: { status: 'PUBLISHED', deletedAt: null } } } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      country: row.country,
      tourCount: row._count.tours,
    }));
  }
}

@ApiTags('Locations')
@Controller('locations')
@Public()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @ApiOperation({ summary: 'Every destination with published tours' })
  @ApiEnvelopeResponse(LocationDto)
  list(): Promise<LocationDto[]> {
    return this.locations.list();
  }
}

@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
