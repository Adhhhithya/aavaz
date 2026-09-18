import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/** IdentityModule is imported for VictimAuthGuard — see
 * identity.module.ts's S6 export note. */
@Module({
  imports: [IdentityModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
