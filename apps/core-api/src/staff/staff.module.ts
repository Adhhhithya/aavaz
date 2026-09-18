import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StaffAuditService } from './staff-audit.service';
import { StaffAuthGuard } from './staff-auth.guard';
import { StaffTokenService } from './staff-token.service';
import { StaffService } from './staff.service';

/**
 * S7 slice: staff identity + session + authorization building blocks. No
 * controller of its own — the only HTTP surface this slice adds is
 * `ConsoleModule`'s two GET endpoints, which import this module for
 * `StaffAuthGuard`/`CurrentStaff`. Mirrors `IdentityModule`'s
 * JwtModule.register({}) choice (see identity.module.ts's own comment):
 * `StaffTokenService` resolves its secret per-call, so no secret is baked
 * into module configuration at boot time.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [StaffTokenService, StaffService, StaffAuthGuard, StaffAuditService],
  exports: [StaffTokenService, StaffService, StaffAuthGuard, StaffAuditService],
})
export class StaffModule {}
