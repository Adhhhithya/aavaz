import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

@Module({
  imports: [IdentityModule],
  controllers: [SafetyController],
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
