import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../staff/staff.decorators';
import { StaffAuthGuard } from '../staff/staff-auth.guard';
import { ResolvedStaff } from '../staff/staff.service';
import { OversightService } from './oversight.service';

/**
 * `GET /v1/oversight/districts/:code/metrics` — v0.2 §14's exact path.
 * Oversight-tier only (`state_admin`/`national_admin`); disjoint from
 * every other console/lifecycle/referral endpoint, which are all
 * individual-record and exclude this tier. See
 * docs/S10_OVERSIGHT_MIGRATION.md.
 */
@Controller('v1/oversight')
@UseGuards(StaffAuthGuard)
export class OversightController {
  constructor(private readonly oversightService: OversightService) {}

  @Get('districts/:code/metrics')
  async getDistrictMetrics(@Param('code') districtCode: string, @CurrentStaff() staff: ResolvedStaff) {
    const metrics = await this.oversightService.getDistrictMetrics(staff, districtCode);
    return { result: 'success', metrics };
  }
}
