import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { IdentityModule } from './identity/identity.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * S4 slice: only PrismaModule + IdentityModule exist. Per the task's
 * explicit instruction, no placeholder modules were created for
 * channel-gateway/workers/console/agent-svc/memory-svc/analysis-svc/
 * speech-svc — those are introduced when their own milestones begin.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    IdentityModule,
  ],
})
export class AppModule {}
