import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TokenPayload, ErrorCodes } from '@flowengine/shared';
import { TokenService } from '../token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'change-me-in-production'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenPayload): Promise<TokenPayload> {
    const authHeader = (req.headers as unknown as Record<string, string>)['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
      const isRevoked = await this.tokenService.isAccessTokenRevoked(token);
      if (isRevoked) {
        throw new UnauthorizedException({
          code: ErrorCodes.AUTH_TOKEN_REVOKED,
          message: 'Token has been revoked',
        });
      }
    }

    return payload;
  }
}
