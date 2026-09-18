import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { TaskModule } from '../task/task.module';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassService } from './break-glass.service';

@Module({
  imports: [StaffModule, TaskModule],
  controllers: [BreakGlassController],
  providers: [BreakGlassService],
})
export class BreakGlassModule {}
