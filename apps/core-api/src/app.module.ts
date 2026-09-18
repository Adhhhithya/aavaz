import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { ConsentModule } from './consent/consent.module';
import { IdentityModule } from './identity/identity.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { SafetyModule } from './safety/safety.module';

/**
 * S4 added PrismaModule + IdentityModule. S5 added CasesModule (imported by
 * IdentityModule). S6 adds ConsentModule/ProfileModule/SafetyModule. Per
 * the task's explicit instruction, no placeholder modules were created for
 * channel-gateway/workers/console/agent-svc/memory-svc/analysis-svc/
 * speech-svc — those are introduced when their own milestones begin.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    IdentityModule,
    ConsentModule,
    ProfileModule,
    SafetyModule,
  ],
})
export class AppModule {}
