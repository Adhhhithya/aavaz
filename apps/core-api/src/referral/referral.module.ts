import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { TaskModule } from '../task/task.module';
import { ReferralAckController } from './referral-ack.controller';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

/** S12 adds TaskModule — ReferralService.transition calls
 * TaskService.createStalledReferralTaskTx when a referral reaches
 * STALLED, inside its own transaction (see referral.service.ts). S16
 * adds ReferralAckController — deliberately a SEPARATE controller (see
 * its own header comment for why it carries no StaffAuthGuard). */
@Module({
  imports: [StaffModule, TaskModule],
  controllers: [ReferralController, ReferralAckController],
  providers: [ReferralService],
})
export class ReferralModule {}
