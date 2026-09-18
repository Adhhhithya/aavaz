import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Victim } from '../identity/identity.decorators';
import { CurrentVictim } from '../identity/token.service';
import { VictimAuthGuard } from '../identity/victim-auth.guard';
import { UpdateSafetySettingsDto } from './dto/update-safety-settings.dto';
import { SafetyService } from './safety.service';

/**
 * Mounted at `/v1/victims/me/safety-settings`. No verify-PIN endpoint is
 * exposed here — see safety.service.ts::verifyDuressPin's comment;
 * live-call duress verification belongs to a later milestone
 * (agent-svc/channel-gateway). Responses NEVER include a PIN/safe-word
 * hash or plaintext — only booleans indicating whether each secret is set.
 */
@Controller('v1/victims/me/safety-settings')
@UseGuards(VictimAuthGuard)
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get()
  async getSettings(@Victim() victim: CurrentVictim) {
    return this.safetyService.getSettings(victim.id);
  }

  @Patch()
  async updateSettings(@Body() dto: UpdateSafetySettingsDto, @Victim() victim: CurrentVictim) {
    const settings = await this.safetyService.updateSettings(victim.id, dto);
    return { status: 'success', ...settings };
  }
}
