import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

@Module({
  imports: [StaffModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
