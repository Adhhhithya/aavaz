import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { OversightController } from './oversight.controller';
import { OversightService } from './oversight.service';

@Module({
  imports: [StaffModule],
  controllers: [OversightController],
  providers: [OversightService],
})
export class OversightModule {}
