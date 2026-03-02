import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCodes } from '@flowengine/shared';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(err: Error | null, user: T, info: Error | null, context: ExecutionContext): T {
    if (err || !user) {
      const message = info?.message || 'Authentication required';
      let code: string = ErrorCodes.AUTH_TOKEN_INVALID;

      if (message.includes('expired')) {
        code = ErrorCodes.AUTH_TOKEN_EXPIRED;
      } else if (message.includes('revoked')) {
        code = ErrorCodes.AUTH_TOKEN_REVOKED;
      }

      throw new UnauthorizedException({ code, message });
    }

    return user;
  }
}
