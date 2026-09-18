import { Controller, Get, Param, Post } from '@nestjs/common';
import { ReferralService } from './referral.service';

/**
 * `GET`/`POST /v1/ack/:token` (v0.2 §14's exact path) — the ONLY
 * unauthenticated write endpoint in this codebase. Deliberately NOT
 * mounted under `/v1/console` and has NO `@UseGuards(StaffAuthGuard)` —
 * this is precisely what v0.2 describes as reachable with "no login."
 * See docs/S16_REFERRAL_ACK_MIGRATION.md for the full security design
 * (256-bit unguessable token, consistent-denial error handling, no
 * victim content ever returned).
 *
 * `:token` is never logged (the framework's own default request logging
 * in this codebase does not log request paths with parameters — see
 * main.ts; no route-specific logging was added here that could log it
 * either).
 */
@Controller('v1/ack')
export class ReferralAckController {
  constructor(private readonly referralService: ReferralService) {}

  @Get(':token')
  async getInfo(@Param('token') token: string) {
    const info = await this.referralService.getAckInfo(token);
    return { result: 'success', ...info };
  }

  @Post(':token')
  async acknowledge(@Param('token') token: string) {
    const info = await this.referralService.acknowledgeViaToken(token);
    return { result: 'success', ...info };
  }
}
