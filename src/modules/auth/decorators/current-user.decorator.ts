import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUserPayload } from '../interfaces/jwt-user-payload.interface';

export const CurrentUser = createParamDecorator(
  <K extends keyof JwtUserPayload>(data: K | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtUserPayload | undefined;
    if (!data) return user;
    return user?.[data];
  },
);

