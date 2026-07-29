import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TOUR_TYPES = ['WALKING', 'BUS', 'MUSEUM', 'DAY_TRIP', 'FOOD', 'PRIVATE'] as const;

export class TourPlanInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  description!: string;
}

export class SaveTourDto {
  @ApiProperty()
  @IsString()
  @MinLength(3, { message: 'Enter a tour title.' })
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ description: 'Derived from the title when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @ApiProperty()
  @IsString()
  @MinLength(10, { message: 'Add a description of at least 10 characters.' })
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ example: 2.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.25)
  @Max(240)
  durationHours!: number;

  @ApiProperty({ enum: TOUR_TYPES })
  @IsIn(TOUR_TYPES)
  type!: (typeof TOUR_TYPES)[number];

  @ApiProperty({ example: 'Rome, Italy' })
  @IsString()
  @MaxLength(120)
  location!: string;

  @ApiProperty({ description: 'Adult price in minor units.', example: 5900 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceEurMinor!: number;

  @ApiProperty({ example: 9900 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceUsdMinor!: number;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  maxTicketsPerTour!: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  highlights!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  included!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  goodToKnow!: string[];

  @ApiProperty({ type: [TourPlanInputDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TourPlanInputDto)
  plans!: TourPlanInputDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  meetingPointTitle?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  meetingPointAddress?: string;

  @ApiProperty()
  @IsBoolean()
  published!: boolean;
}

export class SaveBlogDto {
  @ApiProperty()
  @IsString()
  @MinLength(3, { message: 'Enter a post title.' })
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @ApiProperty()
  @IsString()
  @MinLength(10, { message: 'Add some content before saving.' })
  @MaxLength(100_000)
  content!: string;

  @ApiProperty({ enum: ['PUBLISHED', 'DRAFT'] })
  @IsIn(['PUBLISHED', 'DRAFT'])
  status!: 'PUBLISHED' | 'DRAFT';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  categories!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  metaDescription?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  keywords!: string[];
}

export class UpdateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ enum: ['CONFIRMED', 'PENDING', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['CONFIRMED', 'PENDING', 'CANCELLED'])
  status?: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
}

export class UpsertNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Write something before saving the note.' })
  @MaxLength(2000)
  body!: string;
}
