import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import configuration from '../config/configuration';

/**
 * Victim identity/session issuance and verification — ported from
 * backend/api/auth/victim_dependencies.py.
 *
 * Victims are not provisioned as Supabase Auth users (unchanged decision
 * from S2 — see docs/AAVAZ_IMPLEMENTATION_AUDIT.md). Instead, this issues a
 * self-signed, short-lived JWT (HS256, our own secret — NOT a Supabase
 * token) that later requests present as a bearer token to prove victim
 * identity. Two distinct, non-interchangeable token purposes exist, exactly
 * as in the Python implementation, so a phone-ownership proof can never be
 * replayed as a full victim session or vice versa.
 */

const PHONE_VERIFIED_PURPOSE = 'phone_verified';
const VICTIM_PURPOSE = 'victim';
const DEV_INSECURE_SECRET = 'dev-only-insecure-victim-session-secret-do-not-use-in-production';

export interface PhoneVerifiedClaims {
  purpose: typeof PHONE_VERIFIED_PURPOSE;
  phoneNumber: string;
}

export interface VictimClaims {
  purpose: typeof VICTIM_PURPOSE;
  sub: string;
  phoneNumber: string;
}

export interface CurrentVictim {
  id: string;
  phoneNumber: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
  ) {}

  private secret(): string {
    if (this.config.victimSessionSecret) {
      return this.config.victimSessionSecret;
    }
    if (this.config.nodeEnv.trim().toLowerCase() === 'development') {
      return DEV_INSECURE_SECRET;
    }
    throw new Error(
      'VICTIM_SESSION_SECRET is not configured. Refusing to issue/verify victim session tokens ' +
        'with no secret outside a development environment.',
    );
  }

  issuePhoneVerifiedToken(phoneNumber: string): string {
    const payload: PhoneVerifiedClaims = { purpose: PHONE_VERIFIED_PURPOSE, phoneNumber };
    return this.jwtService.sign(payload, {
      secret: this.secret(),
      expiresIn: this.config.phoneVerifiedTokenTtlSeconds,
    });
  }

  issueVictimSessionToken(victimId: string, phoneNumber: string): string {
    const payload: VictimClaims = { purpose: VICTIM_PURPOSE, sub: victimId, phoneNumber };
    return this.jwtService.sign(payload, {
      secret: this.secret(),
      expiresIn: this.config.victimSessionTtlSeconds,
    });
  }

  /**
   * Returns the decoded claims, or null if the token isn't one of ours at
   * all (wrong signature/algorithm/shape/expired) — deliberately swallows
   * the exception so callers can't distinguish "not our token" from "our
   * token but invalid/expired" from the outside; both map to 401.
   */
  private decode<T extends object>(token: string): T | null {
    try {
      return this.jwtService.verify<T>(token, { secret: this.secret() });
    } catch {
      return null;
    }
  }

  getPhoneVerifiedNumber(token: string): string {
    const claims = this.decode<PhoneVerifiedClaims>(token);
    if (!claims || claims.purpose !== PHONE_VERIFIED_PURPOSE || !claims.phoneNumber) {
      throw new UnauthorizedException('Invalid or expired phone verification');
    }
    return claims.phoneNumber;
  }

  getCurrentVictim(token: string): CurrentVictim {
    const claims = this.decode<VictimClaims>(token);
    if (!claims || claims.purpose !== VICTIM_PURPOSE || !claims.sub) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    return { id: claims.sub, phoneNumber: claims.phoneNumber ?? '' };
  }
}
