import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const TOUR_SORT_OPTIONS = [
  'popular',
  'price-asc',
  'price-desc',
  'duration',
  'newest',
] as const;
export type TourSort = (typeof TOUR_SORT_OPTIONS)[number];

export class ListToursQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search over title and description.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'Location name, e.g. "Rome, Italy".' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ enum: TOUR_SORT_OPTIONS, default: 'popular' })
  @IsOptional()
  @IsIn(TOUR_SORT_OPTIONS)
  sort: TourSort = 'popular';
}

export class TourImageDto {
  @ApiProperty() url!: string;
  @ApiPropertyOptional({ nullable: true }) alt!: string | null;
  @ApiProperty() isCover!: boolean;
}

export class TourSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ example: 'Rome, Italy' }) location!: string;
  @ApiProperty({ example: 2.5 }) durationHours!: number;
  @ApiProperty({ description: 'Adult price in minor units.', example: 5900 })
  priceMinor!: number;
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
  @ApiProperty() description!: string;
  @ApiProperty() isBestseller!: boolean;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
}

export class TourPlanDto {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
}

export class TourDetailDto extends TourSummaryDto {
  @ApiProperty({ type: [String] }) highlights!: string[];
  @ApiProperty({ type: [String] }) included!: string[];
  @ApiProperty({ type: [String] }) goodToKnow!: string[];
  @ApiProperty({ type: [TourPlanDto] }) plan!: TourPlanDto[];
  @ApiProperty({ type: [TourImageDto] }) gallery!: TourImageDto[];
  @ApiPropertyOptional({ nullable: true }) meetingPointTitle!: string | null;
  @ApiPropertyOptional({ nullable: true }) meetingPointAddress!: string | null;
  @ApiProperty({ example: 10 }) maxTicketsPerTour!: number;
}

export class SlotQueryDto {
  @ApiProperty({ example: '2024-05-23', description: 'Calendar date, YYYY-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format.' })
  date!: string;
}

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2024-05-21' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be in YYYY-MM-DD format.' })
  from!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 60, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  days: number = 7;
}

export class SlotDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '09:30' }) time!: string;
  /** Binary by design — the "limited spots" state was removed from the product. */
  @ApiProperty() available!: boolean;
  @ApiProperty({ description: 'Seats still bookable.', example: 12 }) remaining!: number;
}

export class AvailabilityDayDto {
  @ApiProperty({ example: '2024-05-23' }) date!: string;
  @ApiProperty() available!: boolean;
}
