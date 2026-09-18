import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Victim } from '../identity/identity.decorators';
import { CurrentVictim } from '../identity/token.service';
import { VictimAuthGuard } from '../identity/victim-auth.guard';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { ProfileService } from './profile.service';

/**
 * Mounted at `/v1/victims/me/preferences` (matching this task's own v0.2
 * API-shape example — Phase 10). "me" resolves the authenticated victim
 * server-side; it is never a client-supplied victim id. Not wired to any
 * real client yet.
 */
@Controller('v1/victims/me/preferences')
@UseGuards(VictimAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getPreferences(@Victim() victim: CurrentVictim) {
    const profile = await this.profileService.getProfile(victim.id);
    return {
      relationType: profile.relationType,
      preferredChannel: profile.preferredChannel,
      safeWindows: profile.safeWindows,
      safeToCall: profile.safeToCall,
    };
  }

  @Patch()
  async updatePreferences(@Body() dto: UpdatePreferencesDto, @Victim() victim: CurrentVictim) {
    const profile = await this.profileService.updateProfile(victim.id, dto);
    return {
      status: 'success',
      relationType: profile.relationType,
      preferredChannel: profile.preferredChannel,
      safeWindows: profile.safeWindows,
      safeToCall: profile.safeToCall,
    };
  }
}
