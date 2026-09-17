import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { RegisterDto } from './dto/register.dto';
import { PhoneVerifiedNumber, Victim } from './identity.decorators';
import { IdentityService } from './identity.service';
import { ExpiredOtpError, InvalidOtpError, OtpService, RateLimitedError } from './otp.service';
import { PhoneVerifiedGuard } from './phone-verified.guard';
import { RegistrationService } from './registration.service';
import { CurrentVictim, TokenService } from './token.service';
import { VictimAuthGuard } from './victim-auth.guard';

/**
 * The minimum Node endpoint set for the S4 identity/OTP/victim-auth slice —
 * see docs/S4_IDENTITY_MIGRATION.md Phase 6 for why these paths were chosen
 * (same /api/v1/auth/otp/* shape as the existing FastAPI endpoints, but
 * `/api/v1/auth/register` is a DELIBERATELY DIFFERENT path from FastAPI's
 * `/api/v1/intake/app/register` — this is not a drop-in replacement, it's an
 * identity-only subset, and giving it a different path avoids implying
 * otherwise to any caller).
 *
 * NOT wired to any real client yet — see the final report's "API boundary"
 * and "FastAPI transitional behavior" sections. FastAPI's
 * /api/v1/auth/otp/request and /otp/verify remain the ONE production
 * authority for victim authentication until an explicit, documented cutover.
 */
@Controller('api/v1/auth')
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);

  constructor(
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly identityService: IdentityService,
    private readonly registrationService: RegistrationService,
  ) {}

  @Post('otp/request')
  async requestOtp(@Body() dto: OtpRequestDto, @Req() req: Request): Promise<{ status: string }> {
    const clientIp = req.ip;
    try {
      await this.otpService.requestOtp(dto.phoneNumber, clientIp);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        // Deliberately generic + same status for both phone- and IP-based
        // limits, so a caller can't distinguish which counter they hit.
        throw new HttpException(
          'Too many OTP requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.logger.error(`OTP request failed due to configuration error: ${(err as Error).message}`);
      throw new ServiceUnavailableException('OTP service is not available');
    }
    return { status: 'sent' };
  }

  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
  ): Promise<{ status: string; isNewUser: boolean; token: string; tokenType: string; userProfile?: unknown }> {
    try {
      await this.otpService.verifyOtp(dto.phoneNumber, dto.code);
    } catch (err) {
      if (err instanceof InvalidOtpError || err instanceof ExpiredOtpError) {
        throw new UnauthorizedException('Invalid or expired code');
      }
      this.logger.error(`OTP verify failed due to configuration error: ${(err as Error).message}`);
      throw new ServiceUnavailableException('OTP service is not available');
    }

    const existingUser = await this.identityService.findVictimByPhone(dto.phoneNumber);
    if (existingUser) {
      const token = this.tokenService.issueVictimSessionToken(existingUser.id, dto.phoneNumber);
      return {
        status: 'success',
        isNewUser: false,
        token,
        tokenType: 'victim_session',
        userProfile: existingUser,
      };
    }

    const token = this.tokenService.issuePhoneVerifiedToken(dto.phoneNumber);
    return { status: 'success', isNewUser: true, token, tokenType: 'phone_verified' };
  }

  @UseGuards(PhoneVerifiedGuard)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @PhoneVerifiedNumber() phoneNumber: string,
  ): Promise<{ status: string; userId: string; caseId: string; token: string; tokenType: string }> {
    // S5: registration now creates identity + case + counsellor assignment
    // atomically — see registration.service.ts and
    // docs/S5_REGISTRATION_MIGRATION.md. `caseId` is new in the response
    // compared to S4. Field names stay camelCase (idiomatic NestJS/JSON),
    // which is a KNOWN, documented mismatch with FastAPI's snake_case
    // response (`user_id`/`case_id`/`token_type`) that the existing mobile
    // client expects — see the S5 doc's "API compatibility" section. This
    // endpoint is still not wired to any real client (Phase 8/9), so the
    // mismatch has no live effect yet.
    const { user, case: caseRow } = await this.registrationService.register(phoneNumber, dto);
    const token = this.tokenService.issueVictimSessionToken(user.id, phoneNumber);
    return { status: 'success', userId: user.id, caseId: caseRow.id, token, tokenType: 'victim_session' };
  }

  @UseGuards(VictimAuthGuard)
  @Get('me')
  async me(@Victim() victim: CurrentVictim): Promise<{ id: string; phoneNumber: string }> {
    // Pure demonstration/verification endpoint: proves the authenticated
    // victim identity is resolved entirely server-side from the bearer
    // token, never from any client-supplied parameter. Deliberately returns
    // only what's already in the token — it does not read the users table,
    // to keep this endpoint strictly an identity-layer concern.
    return { id: victim.id, phoneNumber: victim.phoneNumber };
  }
}
