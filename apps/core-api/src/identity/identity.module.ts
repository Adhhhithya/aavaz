import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { OtpService } from './otp.service';
import { PhoneVerifiedGuard } from './phone-verified.guard';
import { TokenService } from './token.service';
import { VictimAuthGuard } from './victim-auth.guard';

@Module({
  // JwtModule is registered without a global secret/signOptions — TokenService
  // passes the secret explicitly on every sign/verify call (see
  // token.service.ts::secret()), matching the Python side's per-call pepper
  // resolution (dev fallback vs. hard failure outside development) rather
  // than baking a secret into module configuration at boot time.
  imports: [JwtModule.register({})],
  controllers: [IdentityController],
  providers: [OtpService, TokenService, IdentityService, VictimAuthGuard, PhoneVerifiedGuard],
  exports: [TokenService, OtpService],
})
export class IdentityModule {}
