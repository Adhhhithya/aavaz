import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

@Module({
  imports: [StaffModule],
  controllers: [ReferralController],
  providers: [ReferralService],
})
export class ReferralModule {}
