import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

export class SaveSlotDto {
  @ApiProperty({ example: '2030-06-01', description: 'Calendar date, YYYY-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format.' })
  date!: string;

  @ApiProperty({ example: '09:30', description: '24-hour clock time.' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be in HH:mm format.' })
  time!: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  capacity!: number;
}

export class SaveLocationDto {
  @ApiProperty({ example: 'Milan, Italy' })
  @IsString()
  @MinLength(2, { message: 'Enter a location name.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Italy' })
  @IsString()
  @MinLength(2, { message: 'Enter a country.' })
  @MaxLength(80)
  country!: string;
}

export class SaveTourImagesDto {
  @ApiProperty({
    type: [String],
    description: 'Image URLs, in display order. The first is the cover.',
  })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  urls!: string[];
}

export class TicketHolderInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Enter a first name.' })
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Enter a last name.' })
  @MaxLength(80)
  lastName!: string;
}

export class AddBookingItemDto {
  @ApiProperty({ description: 'The departure to add. The tour is derived from it.' })
  @IsUUID('4')
  slotId!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Add at least one ticket.' })
  @Max(200)
  quantity!: number;

  @ApiPropertyOptional({
    type: [TicketHolderInputDto],
    description: 'Names for the new tickets. Unnamed tickets get a placeholder.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TicketHolderInputDto)
  holders?: TicketHolderInputDto[];
}

export class UpdateBookingItemDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'A tour on a booking needs at least one ticket. Remove it instead.' })
  @Max(200)
  quantity!: number;

  @ApiPropertyOptional({ type: [TicketHolderInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TicketHolderInputDto)
  holders?: TicketHolderInputDto[];
}

const MANUAL_PAYMENT_METHODS = ['CARD', 'PAYPAL', 'APPLE_PAY'] as const;

/**
 * Corrections to a manually-recorded payment.
 *
 * Only reaches payments with no Stripe PaymentIntent behind them — cash, bank
 * transfer, a card taken over the phone. A processor-backed record is written by
 * the webhook and must keep agreeing with what Stripe actually holds, so the
 * service refuses to touch one.
 */
export class UpdatePaymentDto {
  @ApiPropertyOptional({ enum: MANUAL_PAYMENT_METHODS })
  @IsOptional()
  @IsIn(MANUAL_PAYMENT_METHODS)
  method?: 'CARD' | 'PAYPAL' | 'APPLE_PAY';

  @ApiPropertyOptional({ description: 'Reference from the terminal, bank or receipt.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  transactionId?: string;

  @ApiPropertyOptional({ description: 'Captured amount in minor units.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @ApiPropertyOptional({ description: 'When the money arrived, ISO 8601.' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}
