import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../staff/staff.decorators';
import { StaffAuthGuard } from '../staff/staff-auth.guard';
import { ResolvedStaff } from '../staff/staff.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { MarkMilestoneMetDto } from './dto/mark-milestone-met.dto';
import { MilestoneService } from './milestone.service';

/**
 * Mounted at `/v1/console/cases/:caseId/milestones` (create/list) and
 * `/v1/console/milestones/:milestoneId/met` (mark met) — staff-facing,
 * alongside every other S7-S12 console endpoint. Not wired to any real
 * client yet, same posture as every prior slice. See
 * docs/S13_MILESTONE_MIGRATION.md.
 */
@Controller('v1/console')
@UseGuards(StaffAuthGuard)
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Post('cases/:caseId/milestones')
  async create(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const milestone = await this.milestoneService.create(staff, caseId, dto.type, dto.dueAt);
    return { result: 'success', milestone };
  }

  @Get('cases/:caseId/milestones')
  async list(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentStaff() staff: ResolvedStaff) {
    const milestones = await this.milestoneService.listForCase(staff, caseId);
    return { result: 'success', milestones };
  }

  @Patch('milestones/:milestoneId/met')
  async markMet(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() dto: MarkMilestoneMetDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const milestone = await this.milestoneService.markMet(staff, milestoneId, dto.metAt);
    return { result: 'success', milestone };
  }
}
