import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from '@flowengine/shared';

export const CurrentUser = createParamDecorator(
  (data: keyof TokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as TokenPayload;

    return data ? user?.[data] : user;
  },
);
