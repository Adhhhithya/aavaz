import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { extractBearerToken } from './bearer-token.util';
import { TokenService } from './token.service';

export interface RequestWithPhoneVerified extends Request {
  phoneVerifiedNumber?: string;
}

/**
 * Guard for POST /api/v1/auth/register — equivalent of
 * api/auth/victim_dependencies.py::get_phone_verified_number. Proves the
 * caller just completed OTP verification for the phone number it returns;
 * the phone number is NEVER accepted from the request body (see
 * RegisterDto — it deliberately has no phoneNumber field).
 */
@Injectable()
export class PhoneVerifiedGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithPhoneVerified>();
    const token = extractBearerToken(request);
    request.phoneVerifiedNumber = this.tokenService.getPhoneVerifiedNumber(token);
    return true;
  }
}
