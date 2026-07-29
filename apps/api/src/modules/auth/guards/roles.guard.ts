import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@pasta/types';

import { ROLES_KEY, type RequestWithUser } from '../../../common/decorators/auth.decorators';

/**
 * Enforces `@Roles(...)`. Runs after `JwtAuthGuard`, so a missing principal
 * here means the route was left public by mistake — which is treated as a
 * failure rather than a pass.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    return true;
  }
}
