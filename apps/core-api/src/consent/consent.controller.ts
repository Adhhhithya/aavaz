import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Victim } from '../identity/identity.decorators';
import { CurrentVictim } from '../identity/token.service';
import { VictimAuthGuard } from '../identity/victim-auth.guard';
import { ConsentService } from './consent.service';
import { GrantConsentDto } from './dto/grant-consent.dto';

/**
 * Mounted at `/v1/consents` (v0.2's own convention, per Phase 10 — no
 * FastAPI equivalent exists to mirror, unlike identity's `/api/v1/auth/*`
 * paths in S4/S5). Not wired to any real client yet — see
 * docs/S6_ONBOARDING_MIGRATION.md Phase 9/11.
 */
@Controller('v1/consents')
@UseGuards(VictimAuthGuard)
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Post()
  async grant(@Body() dto: GrantConsentDto, @Victim() victim: CurrentVictim) {
    const consent = await this.consentService.grantConsent(victim.id, dto);
    return {
      status: 'success',
      scope: consent.scope,
      granted: consent.granted,
      textVersionHash: consent.textVersionHash,
      capturedAt: consent.capturedAt,
    };
  }

  @Get()
  async getCurrent(@Victim() victim: CurrentVictim) {
    const consents = await this.consentService.getCurrentConsents(victim.id);
    return {
      consents: consents.map((c) => ({
        scope: c.scope,
        granted: c.granted,
        channel: c.channel,
        capturedAt: c.capturedAt,
      })),
    };
  }
}
