import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { RequestWithStaff } from './staff-auth.guard';

/** Use alongside @UseGuards(StaffAuthGuard) to inject the resolved staff
 * identity into a controller method — never trust a client-supplied staff
 * id/role/district instead of this. */
export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithStaff>();
  return request.staff;
});
