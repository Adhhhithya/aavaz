import { registerAs } from '@nestjs/config';

/**
 * Environment-based configuration only — see Phase 11. No secret has a
 * committed real value anywhere; every secret-shaped setting defaults to an
 * empty string and is resolved at call time by the service that needs it
 * (see otp.service.ts / token.service.ts for the "empty in production is a
 * hard error, empty in development uses a clearly-labeled insecure
 * placeholder" pattern already established in the Python implementation).
 *
 * Uses @nestjs/config's registerAs() (rather than a plain default export) so
 * it carries a typed `.KEY` for @Inject(configuration.KEY) — the idiomatic
 * NestJS pattern for typed, namespaced configuration.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  otpPepper: string;
  otpLength: number;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpRateLimitWindowSeconds: number;
  otpRateLimitPerPhone: number;
  otpRateLimitPerIp: number;
  victimSessionSecret: string;
  victimSessionTtlSeconds: number;
  phoneVerifiedTokenTtlSeconds: number;
}

function int(value: string | undefined, fallback: number): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: int(process.env.PORT, 3001),
    otpPepper: process.env.OTP_PEPPER ?? '',
    otpLength: int(process.env.OTP_LENGTH, 6),
    otpTtlSeconds: int(process.env.OTP_TTL_SECONDS, 300),
    otpMaxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 3),
    otpRateLimitWindowSeconds: int(process.env.OTP_RATE_LIMIT_WINDOW_SECONDS, 900),
    otpRateLimitPerPhone: int(process.env.OTP_RATE_LIMIT_PER_PHONE, 5),
    otpRateLimitPerIp: int(process.env.OTP_RATE_LIMIT_PER_IP, 20),
    victimSessionSecret: process.env.VICTIM_SESSION_SECRET ?? '',
    victimSessionTtlSeconds: int(process.env.VICTIM_SESSION_TTL_SECONDS, 86400),
    phoneVerifiedTokenTtlSeconds: int(process.env.PHONE_VERIFIED_TOKEN_TTL_SECONDS, 600),
    // No global counsellor-caseload-cap setting here on purpose: v0.2's data
    // model (§12) makes `caseload_cap` a per-staff-row column, not a
    // system-wide constant, so it lives on `counsellors.caseload_cap`
    // (backend/migrations/0003_counsellor_caseload_cap.sql) — each row
    // defaults to 80 at the database level — and is read per-row by
    // cases/assignment.service.ts, not from environment configuration.
  }),
);
