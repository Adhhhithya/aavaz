import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import configuration from '../config/configuration';

/**
 * Staff session issuance/verification — same S4 `TokenService` pattern
 * (self-signed HS256 JWT, dev-fallback-or-throw secret resolution), a
 * SEPARATE token purpose and a SEPARATE secret
 * (`STAFF_SESSION_SECRET`/`staffSessionSecret`) from the victim session, so
 * neither can ever be replayed as the other even if the two secrets were
 * accidentally set to the same value.
 *
 * Deliberately carries ONLY the authenticated user's id as a claim — no
 * role, no district_scope, no counsellor linkage. Per this milestone's
 * explicit instruction to "treat database state as the authority for
 * current role/scope rather than trusting stale client claims for
 * sensitive authorization," `StaffAuthGuard` re-resolves the current
 * `Staff` row from the database on every single request using this id. A
 * role change or a staff account's removal takes effect on the very next
 * request, not at next token expiry — the token proves *who*, never
 * *what they're currently allowed to do*.
 */

const STAFF_SESSION_PURPOSE = 'staff_session';
const DEV_INSECURE_SECRET = 'dev-only-insecure-staff-session-secret-do-not-use-in-production';

export interface StaffSessionClaims {
  purpose: typeof STAFF_SESSION_PURPOSE;
  sub: string;
}

export interface CurrentStaffSession {
  userId: string;
}

@Injectable()
export class StaffTokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(configuration.KEY) private readonly config: ConfigType<typeof configuration>,
  ) {}

  private secret(): string {
    if (this.config.staffSessionSecret) {
      return this.config.staffSessionSecret;
    }
    if (this.config.nodeEnv.trim().toLowerCase() === 'development') {
      return DEV_INSECURE_SECRET;
    }
    throw new Error(
      'STAFF_SESSION_SECRET is not configured. Refusing to issue/verify staff session tokens ' +
        'with no secret outside a development environment.',
    );
  }

  /**
   * NOT reachable via any public HTTP endpoint in this slice — see
   * docs/S7_STAFF_CONSOLE_MIGRATION.md's "Staff session issuance" section
   * for the explicit, documented reasoning (Supabase Auth's demonstrated
   * non-alignment with this app's real authentication model, and the
   * decision to prove the token mechanism in isolation before any real
   * login path is wired to it — the same sequencing S4 used for victim
   * identity before S5 built registration on top of it). Tests obtain a
   * token by calling this method directly via the DI container, the same
   * pattern already used for `AssignmentService` in S5's integration
   * tests.
   */
  issueStaffSessionToken(userId: string): string {
    const payload: StaffSessionClaims = { purpose: STAFF_SESSION_PURPOSE, sub: userId };
    return this.jwtService.sign(payload, {
      secret: this.secret(),
      expiresIn: this.config.staffSessionTtlSeconds,
    });
  }

  private decode<T extends object>(token: string): T | null {
    try {
      return this.jwtService.verify<T>(token, { secret: this.secret() });
    } catch {
      return null;
    }
  }

  getCurrentStaffSession(token: string): CurrentStaffSession {
    const claims = this.decode<StaffSessionClaims>(token);
    if (!claims || claims.purpose !== STAFF_SESSION_PURPOSE || !claims.sub) {
      throw new UnauthorizedException('Invalid or expired staff session');
    }
    return { userId: claims.sub };
  }
}
