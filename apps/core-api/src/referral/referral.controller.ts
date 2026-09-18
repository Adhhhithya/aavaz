import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../staff/staff.decorators';
import { StaffAuthGuard } from '../staff/staff-auth.guard';
import { ResolvedStaff } from '../staff/staff.service';
import { DraftReferralDto } from './dto/draft-referral.dto';
import { TransitionReferralDto } from './dto/transition-referral.dto';
import { ReferralService } from './referral.service';

/**
 * Mounted at `/v1/console/cases/:caseId/referrals` (draft) and
 * `/v1/console/referrals/:referralId` (transition/read) — staff-facing,
 * alongside S7's console endpoints and S8's lifecycle endpoint. Not wired
 * to any real client yet, same posture as every prior slice. See
 * docs/S9_REFERRAL_MIGRATION.md.
 */
@Controller('v1/console')
@UseGuards(StaffAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('cases/:caseId/referrals')
  async draft(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: DraftReferralDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const referral = await this.referralService.draft(staff, caseId, dto.destinationType, dto.fields);
    return { result: 'success', referral };
  }

  @Get('referrals/:referralId')
  async get(@Param('referralId', ParseUUIDPipe) referralId: string, @CurrentStaff() staff: ResolvedStaff) {
    const referral = await this.referralService.get(staff, referralId);
    return { result: 'success', referral };
  }

  @Patch('referrals/:referralId')
  async transition(
    @Param('referralId', ParseUUIDPipe) referralId: string,
    @Body() dto: TransitionReferralDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const referral = await this.referralService.transition(staff, referralId, dto.targetState);
    return { result: 'success', referral };
  }
}
