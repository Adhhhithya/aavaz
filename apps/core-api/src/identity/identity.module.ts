import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CasesModule } from '../cases/cases.module';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { OtpService } from './otp.service';
import { PhoneVerifiedGuard } from './phone-verified.guard';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';
import { VictimAuthGuard } from './victim-auth.guard';

@Module({
  // JwtModule is registered without a global secret/signOptions — TokenService
  // passes the secret explicitly on every sign/verify call (see
  // token.service.ts::secret()), matching the Python side's per-call pepper
  // resolution (dev fallback vs. hard failure outside development) rather
  // than baking a secret into module configuration at boot time.
  //
  // CasesModule is imported here (rather than the other way around) because
  // registration is what needs case creation + assignment — see
  // registration.service.ts and docs/S5_REGISTRATION_MIGRATION.md.
  imports: [JwtModule.register({}), CasesModule],
  controllers: [IdentityController],
  providers: [OtpService, TokenService, IdentityService, RegistrationService, VictimAuthGuard, PhoneVerifiedGuard],
  // VictimAuthGuard is exported (new in S6) so the consent/profile/safety
  // modules can authenticate their own endpoints without duplicating the
  // victim-session token verification logic — see
  // docs/S6_ONBOARDING_MIGRATION.md Phase 3.
  exports: [TokenService, OtpService, VictimAuthGuard],
})
export class IdentityModule {}
