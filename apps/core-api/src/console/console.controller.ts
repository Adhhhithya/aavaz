import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../staff/staff.decorators';
import { StaffAuthGuard } from '../staff/staff-auth.guard';
import { ResolvedStaff } from '../staff/staff.service';
import { ConsoleService } from './console.service';

/**
 * Mounted at `/v1/console` (v0.2's own convention, §14 — no FastAPI
 * equivalent exists to mirror). Deliberately the smallest useful surface
 * to prove the authorization boundary: two read-only endpoints, matching
 * this milestone's explicit scope. No assessment-review, referral-
 * approval, triage, or task-mutation endpoint exists here — those need
 * domains (`assessments`, `referrals`, `tasks`) this slice does not
 * create. Not wired to any real client yet.
 */
@Controller('v1/console')
@UseGuards(StaffAuthGuard)
export class ConsoleController {
  constructor(private readonly consoleService: ConsoleService) {}

  @Get('queue')
  async getQueue(@CurrentStaff() staff: ResolvedStaff) {
    const queue = await this.consoleService.getQueue(staff);
    return { queue };
  }

  @Get('victims/:id')
  async getVictim(@Param('id', ParseUUIDPipe) id: string, @CurrentStaff() staff: ResolvedStaff) {
    return this.consoleService.getVictim(staff, id);
  }
}
