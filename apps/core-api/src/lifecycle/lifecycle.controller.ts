import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../staff/staff.decorators';
import { StaffAuthGuard } from '../staff/staff-auth.guard';
import { ResolvedStaff } from '../staff/staff.service';
import { TransitionLifecycleDto } from './dto/transition-lifecycle.dto';
import { LifecycleService } from './lifecycle.service';

/**
 * Mounted at `/v1/console/cases/:caseId/lifecycle` — staff-facing case
 * management, alongside S7's `/v1/console/*` read endpoints. Not wired to
 * any real client yet (same "prove it in isolation first" posture as
 * every prior slice). See docs/S8_LIFECYCLE_MIGRATION.md.
 */
@Controller('v1/console/cases/:caseId/lifecycle')
@UseGuards(StaffAuthGuard)
export class LifecycleController {
  constructor(private readonly lifecycleService: LifecycleService) {}

  @Patch()
  async transition(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: TransitionLifecycleDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const result = await this.lifecycleService.transition(staff, caseId, dto.targetState);
    return { status: 'success', ...result };
  }
}
