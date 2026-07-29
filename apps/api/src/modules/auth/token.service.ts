import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { jwtConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { AccessTokenPayload, isUuid, parseDurationToSeconds } from './auth.constants';

export interface IssuedRefreshToken {
  /** The value handed to the browser, `<id>.<secret>`. */
  token: string;
  expiresAt: Date;
}

export interface SessionContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

interface TokenOwner {
  id: string;
  email: string;
  role: string;
}

/**
 * Issues and verifies credentials.
 *
 * Access tokens are short-lived JWTs. Refresh tokens are opaque random strings
 * — only their SHA-256 hash is stored, so a database leak cannot be replayed —
 * and every use rotates them. Re-use of an already-rotated token is treated as
 * theft and kills the entire session family.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @Inject(jwtConfig.KEY) private readonly config: ConfigType<typeof jwtConfig>,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  get accessTtlSeconds(): number {
    return parseDurationToSeconds(this.config.accessTtl);
  }

  get refreshTtlSeconds(): number {
    return parseDurationToSeconds(this.config.refreshTtl);
  }

  private secret(kind: 'access'): string {
    const value = kind === 'access' ? this.config.accessSecret : undefined;
    if (!value) {
      throw new Error('JWT_ACCESS_SECRET is not configured.');
    }
    return value;
  }

  signAccessToken(user: TokenOwner): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      typ: 'access',
    };

    return this.jwt.sign(payload, {
      secret: this.secret('access'),
      expiresIn: this.accessTtlSeconds,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.secret('access'),
      });

      if (payload.typ !== 'access') {
        throw new UnauthorizedException('Invalid token type.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }
  }

  private static hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /** Constant-time comparison so a stored hash cannot be probed byte by byte. */
  private static matches(candidateHash: string, storedHash: string): boolean {
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async issueRefreshToken(
    userId: string,
    context: SessionContext = {},
  ): Promise<IssuedRefreshToken> {
    const secret = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: TokenService.hash(secret),
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt,
      },
    });

    return { token: `${record.id}.${secret}`, expiresAt };
  }

  /**
   * Validates a refresh token and replaces it with a fresh one.
   * Returns the owning user id, or throws if the token is unusable.
   */
  async rotateRefreshToken(
    rawToken: string,
    context: SessionContext = {},
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const [id, secret] = rawToken.split('.');
    if (!id || !secret || !isUuid(id)) {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { id } });

    if (!stored || !TokenService.matches(TokenService.hash(secret), stored.tokenHash)) {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    if (stored.revokedAt) {
      // A revoked token was presented: either a stolen copy or a replayed one.
      // Kill every session for this user and force a fresh login.
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}; revoking family.`);
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    const refresh = await this.issueRefreshToken(stored.userId, context);
    const replacementId = refresh.token.split('.')[0];

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacementId ?? null },
    });

    return { userId: stored.userId, refresh };
  }

  /** Revokes a single session. Silently ignores tokens that no longer exist. */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const [id] = rawToken.split('.');
    if (!id || !isUuid(id)) return;

    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Removes expired and long-revoked rows. Called by the nightly cron. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 86_400 * 1000);
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
    });
    return count;
  }
}
