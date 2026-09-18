import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../staff/staff.decorators';
import { StaffAuthGuard } from '../staff/staff-auth.guard';
import { ResolvedStaff } from '../staff/staff.service';
import { BreakGlassService } from './break-glass.service';
import { RequestBreakGlassDto } from './dto/request-break-glass.dto';

/**
 * Mounted at `/v1/console/cases/:caseId/break-glass` — staff-facing,
 * alongside every other S7-S14 console endpoint. Not wired to any real
 * client yet, same posture as every prior slice. See
 * docs/S15_BREAK_GLASS_MIGRATION.md.
 */
@Controller('v1/console')
@UseGuards(StaffAuthGuard)
export class BreakGlassController {
  constructor(private readonly breakGlassService: BreakGlassService) {}

  @Post('cases/:caseId/break-glass')
  async request(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RequestBreakGlassDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const grant = await this.breakGlassService.request(staff, caseId, dto.reason);
    return { result: 'success', grant };
  }
}
