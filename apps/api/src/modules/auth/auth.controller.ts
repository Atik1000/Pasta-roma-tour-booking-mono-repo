import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ApiEnvelopeResponse } from '../../common/decorators/api-response.decorator';
import {
  CurrentUser,
  Public,
  type AuthenticatedUser,
} from '../../common/decorators/auth.decorators';
import { appConfig } from '../../config/configuration';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './auth.constants';
import {
  AuthUserDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  MessageResponseDto,
  ResetPasswordDto,
  SessionDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import type { IssuedRefreshToken, SessionContext } from './token.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  // Credential stuffing protection: far tighter than the global limit.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in and receive an access token' })
  @ApiEnvelopeResponse(LoginResponseDto)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const { response: body, refresh } = await this.auth.login(
      dto.email,
      dto.password,
      AuthController.contextOf(request),
    );

    this.setRefreshCookie(response, refresh);
    return body;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new access token' })
  @ApiEnvelopeResponse(LoginResponseDto)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const raw = AuthController.refreshCookie(request);
    const { response: body, refresh } = await this.auth.refresh(
      raw ?? '',
      AuthController.contextOf(request),
    );

    this.setRefreshCookie(response, refresh);
    return body;
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiEnvelopeResponse(MessageResponseDto)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageResponseDto> {
    await this.auth.logout(AuthController.refreshCookie(request));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { message: 'Signed out.' };
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiEnvelopeResponse(AuthUserDto)
  me(@CurrentUser('id') userId: string): Promise<AuthUserDto> {
    return this.auth.me(userId);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update your own name and email address' })
  @ApiEnvelopeResponse(AuthUserDto)
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthUserDto> {
    return this.auth.updateProfile(userId, dto.name, dto.email);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiOperation({ summary: 'Email a password-reset link' })
  @ApiEnvelopeResponse(MessageResponseDto)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    await this.auth.forgotPassword(dto.email, `${this.config.adminUrl}/reset-password`);

    // Deliberately identical whether or not the address exists.
    return { message: 'If that address belongs to an account, a reset link is on its way.' };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  @ApiEnvelopeResponse(MessageResponseDto)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    await this.auth.resetPassword(dto.token, dto.password);
    return { message: 'Your password has been updated. Please sign in again.' };
  }

  @Post('change-password')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change your password' })
  @ApiEnvelopeResponse(MessageResponseDto)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageResponseDto> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { message: 'Your password has been updated. Please sign in again.' };
  }

  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List active sessions' })
  @ApiEnvelopeResponse(SessionDto)
  sessions(@CurrentUser('id') userId: string, @Req() request: Request): Promise<SessionDto[]> {
    return this.auth.listSessions(userId, AuthController.refreshCookie(request));
  }

  @Delete('sessions/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a single session' })
  @ApiEnvelopeResponse(MessageResponseDto)
  async revokeSession(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<MessageResponseDto> {
    await this.auth.revokeSession(userId, sessionId);
    return { message: 'Session revoked.' };
  }

  // --- helpers ---------------------------------------------------------------

  private cookieOptions() {
    return {
      httpOnly: true,
      // Keyed to the scheme actually in use, not to NODE_ENV: a `Secure` cookie
      // is never returned over plain http, so a production host without a
      // certificate would drop the refresh cookie and log the panel out on
      // every reload.
      secure: this.config.isHttps,
      sameSite: 'lax' as const,
      // Scoped to the refresh and logout endpoints only.
      path: `/${this.config.prefix}/auth`,
    };
  }

  private setRefreshCookie(response: Response, refresh: IssuedRefreshToken): void {
    response.cookie(REFRESH_COOKIE, refresh.token, {
      ...this.cookieOptions(),
      expires: refresh.expiresAt,
    });
  }

  private static refreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private static contextOf(request: Request): SessionContext {
    return {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    };
  }
}
