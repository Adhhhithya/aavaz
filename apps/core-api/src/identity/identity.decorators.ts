import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { RequestWithVictim } from './victim-auth.guard';
import { RequestWithPhoneVerified } from './phone-verified.guard';

/** Use alongside @UseGuards(VictimAuthGuard) to inject the resolved victim
 * identity into a controller method — never trust a client-supplied id
 * instead of this. */
export const Victim = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithVictim>();
  return request.victim;
});

/** Use alongside @UseGuards(PhoneVerifiedGuard) to inject the verified phone
 * number into POST /register — never accepted from the request body. */
export const PhoneVerifiedNumber = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithPhoneVerified>();
  return request.phoneVerifiedNumber;
});
