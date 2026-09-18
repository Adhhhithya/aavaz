import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { extractBearerToken } from '../identity/bearer-token.util';
import { StaffTokenService } from './staff-token.service';
import { ResolvedStaff, StaffService } from './staff.service';

export interface RequestWithStaff extends Request {
  staff?: ResolvedStaff;
}

/**
 * NestJS guard equivalent of
 * backend/api/auth/dependencies.py::get_current_staff_user, but resolving
 * a Node-issued staff session instead of a Supabase Auth token, and
 * re-resolving the staff identity fresh from the database on EVERY
 * request (see staff-token.service.ts's header — the token only proves
 * *who*, the database is the authority on *what they're currently allowed
 * to do*).
 *
 * A victim session token fails here at the first step: `getCurrentStaffSession`
 * only ever accepts a `staff_session`-purpose token, and a victim token's
 * purpose is `victim` — `TokenService`/`StaffTokenService` use separate
 * secrets and separate purposes, so a victim token cannot even be decoded
 * as a staff session, let alone pass the purpose check.
 *
 * 401 vs 403, matching the existing FastAPI convention exactly: a missing/
 * malformed/invalid/expired token is 401 (authentication failure — thrown
 * by `extractBearerToken`/`getCurrentStaffSession`); a valid staff session
 * token whose user has no `staff` row is 403 (authenticated, but not
 * authorized as staff).
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly staffTokenService: StaffTokenService,
    private readonly staffService: StaffService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithStaff>();
    const token = extractBearerToken(request);
    const session = this.staffTokenService.getCurrentStaffSession(token);

    const staff = await this.staffService.getStaffForUser(session.userId);
    if (!staff) {
      throw new ForbiddenException('This account does not have staff access');
    }

    request.staff = staff;
    return true;
  }
}
