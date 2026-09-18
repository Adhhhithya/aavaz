import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { ConsoleController } from './console.controller';
import { ConsoleService } from './console.service';

@Module({
  imports: [StaffModule],
  controllers: [ConsoleController],
  providers: [ConsoleService],
})
export class ConsoleModule {}
