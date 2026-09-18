import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { MilestoneController } from './milestone.controller';
import { MilestoneService } from './milestone.service';

@Module({
  imports: [StaffModule],
  controllers: [MilestoneController],
  providers: [MilestoneService],
})
export class MilestoneModule {}
