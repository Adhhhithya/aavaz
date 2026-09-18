import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { ConsentModule } from './consent/consent.module';
import { ConsoleModule } from './console/console.module';
import { IdentityModule } from './identity/identity.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { SafetyModule } from './safety/safety.module';
import { StaffModule } from './staff/staff.module';

/**
 * S4 added PrismaModule + IdentityModule. S5 added CasesModule (imported by
 * IdentityModule). S6 added ConsentModule/ProfileModule/SafetyModule. S7
 * adds StaffModule + ConsoleModule. Per the task's explicit instruction, no
 * placeholder modules were created for channel-gateway/workers/
 * agent-svc/memory-svc/analysis-svc/speech-svc, and no full React `console`
 * app migration was attempted — those remain later milestones.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    IdentityModule,
    ConsentModule,
    ProfileModule,
    SafetyModule,
    StaffModule,
    ConsoleModule,
  ],
})
export class AppModule {}
