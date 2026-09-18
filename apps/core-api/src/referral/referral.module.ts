import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { TaskModule } from '../task/task.module';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

/** S12 adds TaskModule — ReferralService.transition calls
 * TaskService.createStalledReferralTaskTx when a referral reaches
 * STALLED, inside its own transaction (see referral.service.ts). */
@Module({
  imports: [StaffModule, TaskModule],
  controllers: [ReferralController],
  providers: [ReferralService],
})
export class ReferralModule {}
