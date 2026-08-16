import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MIN_LENGTH } from '../auth.constants';

export class LoginDto {
  @ApiProperty({ example: 'admin@pastaromatour.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @IsNotEmpty({ message: 'Enter your password.' })
  @MaxLength(128)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@pastaromatour.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset email.' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  @MaxLength(128)
  password!: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'Giulia Rossi' })
  @IsString()
  @MinLength(2, { message: 'Enter your name.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'admin@pastaromatour.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your current password.' })
  currentPassword!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  @MaxLength(128)
  newPassword!: string;
}

// --- responses ---------------------------------------------------------------

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ADMIN', 'EDITOR'] }) role!: string;
  @ApiProperty({ required: false, nullable: true }) avatarUrl?: string | null;
}

export class LoginResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Seconds until the access token expires.' }) expiresIn!: number;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Done.' }) message!: string;
}

export class SessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false, nullable: true }) userAgent?: string | null;
  @ApiProperty({ required: false, nullable: true }) ipAddress?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ description: 'True for the session making this request.' }) current!: boolean;
}
