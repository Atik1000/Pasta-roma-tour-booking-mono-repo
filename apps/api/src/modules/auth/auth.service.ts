import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { isUuid, PASSWORD_RESET_TTL_MINUTES } from './auth.constants';
import type { AuthUserDto, LoginResponseDto, SessionDto } from './dto/auth.dto';
import { IssuedRefreshToken, SessionContext, TokenService } from './token.service';

/**
 * Argon2id parameters. Comfortably above OWASP's 2024 floor (19 MiB, t=2)
 * while staying fast enough for an interactive login.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * Verifies credentials and issues a token pair.
   *
   * Failures are deliberately indistinguishable: unknown email, wrong password
   * and deactivated account all produce the same message, so the endpoint
   * cannot be used to enumerate accounts.
   */
  async login(
    email: string,
    password: string,
    context: SessionContext,
  ): Promise<{ response: LoginResponseDto; refresh: IssuedRefreshToken }> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
    });

    const invalid = new UnauthorizedException('Incorrect email or password.');

    if (!user) {
      // Spend comparable time on a dummy hash so response timing does not
      // reveal whether the address exists.
      await AuthService.hashPassword(password).catch(() => undefined);
      throw invalid;
    }

    const passwordMatches = await verify(user.passwordHash, password).catch(() => false);
    if (!passwordMatches || !user.isActive) {
      throw invalid;
    }

    const [, refresh] = await Promise.all([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.tokens.issueRefreshToken(user.id, context),
    ]);

    return {
      response: {
        accessToken: this.tokens.signAccessToken(user),
        expiresIn: this.tokens.accessTtlSeconds,
        user: AuthService.toAuthUser(user),
      },
      refresh,
    };
  }

  /** Exchanges a refresh token for a new pair. */
  async refresh(
    rawToken: string,
    context: SessionContext,
  ): Promise<{ response: LoginResponseDto; refresh: IssuedRefreshToken }> {
    const { userId, refresh } = await this.tokens.rotateRefreshToken(rawToken, context);

    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user || !user.isActive) {
      await this.tokens.revokeAllForUser(userId);
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    return {
      response: {
        accessToken: this.tokens.signAccessToken(user),
        expiresIn: this.tokens.accessTtlSeconds,
        user: AuthService.toAuthUser(user),
      },
      refresh,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) {
      await this.tokens.revokeRefreshToken(rawToken);
    }
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }
    return AuthService.toAuthUser(user);
  }

  /**
   * Starts a password reset.
   *
   * Always resolves, whether or not the address exists — the response must not
   * disclose which addresses are registered.
   */
  async forgotPassword(email: string, resetUrlBase: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null, isActive: true },
    });

    if (!user) {
      this.logger.debug(`Password reset requested for unknown address: ${email}`);
      return;
    }

    // Invalidate any outstanding links before issuing a new one.
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const secret = randomBytes(32).toString('base64url');
    const record = await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(secret).digest('hex'),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
      },
    });

    const link = `${resetUrlBase}?token=${record.id}.${secret}`;

    await this.mail.send({
      to: user.email,
      subject: 'Reset your Pasta Roma Tour password',
      html: `
        <p>Hello ${user.name},</p>
        <p>We received a request to reset your password. This link is valid for ${PASSWORD_RESET_TTL_MINUTES} minutes:</p>
        <p><a href="${link}">Reset your password</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
      text: `Reset your password: ${link}`,
    });
  }

  /** Completes a reset, then signs every existing session out. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const invalid = new UnauthorizedException('This reset link is invalid or has expired.');

    const [id, secret] = rawToken.split('.');
    if (!id || !secret || !isUuid(id)) throw invalid;

    const record = await this.prisma.passwordReset.findUnique({ where: { id } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid;

    const candidate = Buffer.from(createHash('sha256').update(secret).digest('hex'), 'hex');
    const stored = Buffer.from(record.tokenHash, 'hex');
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) throw invalid;

    const passwordHash = await AuthService.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Changes the password of the signed-in user and drops their other sessions. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Your session is invalid or has expired.');

    const matches = await verify(user.passwordHash, currentPassword).catch(() => false);
    if (!matches) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await AuthService.hashPassword(newPassword) },
    });

    await this.tokens.revokeAllForUser(user.id);
  }

  /** Active sessions for the account, newest first. */
  async listSessions(userId: string, currentRawToken?: string): Promise<SessionDto[]> {
    const currentId = currentRawToken?.split('.')[0];

    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      current: session.id === currentId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private static toAuthUser(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
  }): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
    };
  }
}

export type { AuthenticatedUser };
