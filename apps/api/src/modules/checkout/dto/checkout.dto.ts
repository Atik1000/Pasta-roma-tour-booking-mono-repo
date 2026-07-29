import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TicketHolderDto {
  @ApiProperty({ example: 'James' })
  @IsString()
  @MinLength(1, { message: 'Enter a first name.' })
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @MinLength(1, { message: 'Enter a last name.' })
  @MaxLength(80)
  lastName!: string;
}

export class CheckoutDto {
  @ApiProperty({ example: 'John Michael Smith' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name.' })
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ type: [TicketHolderDto], description: 'One entry per ticket, in cart order.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TicketHolderDto)
  ticketHolders!: TicketHolderDto[];
}

export class CheckoutResultDto {
  @ApiProperty({ example: 'BK-2024-0521' }) reference!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() totalMinor!: number;
  @ApiProperty({ enum: ['EUR', 'USD'] }) currency!: 'EUR' | 'USD';
  @ApiProperty({ example: 'PENDING' }) status!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Stripe PaymentIntent client secret.' })
  paymentIntentClientSecret!: string | null;
}
