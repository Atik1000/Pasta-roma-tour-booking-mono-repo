import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@pasta/types';

import {
  IS_PUBLIC_KEY,
  type AuthenticatedUser,
  type RequestWithUser,
} from '../../../common/decorators/auth.decorators';
import { TokenService } from '../token.service';

/**
 * Registered globally: every route requires a valid access token unless it is
 * marked `@Public()`. Defaulting to closed means a new endpoint cannot be
 * exposed by forgetting a decorator.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = JwtAuthGuard.extractToken(request.headers.authorization);

    // Public routes still populate `request.user` when a token is present, so
    // handlers can personalise a response without requiring authentication.
    if (isPublic) {
      if (token) {
        try {
          request.user = this.toUser(token);
        } catch {
          // An invalid token on a public route is simply ignored.
        }
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    request.user = this.toUser(token);
    return true;
  }

  private toUser(token: string): AuthenticatedUser {
    const payload = this.tokens.verifyAccessToken(token);
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
    };
  }

  private static extractToken(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
