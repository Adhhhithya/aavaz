import { Injectable, Logger } from '@nestjs/common';

/**
 * OTP delivery provider abstraction — ported from
 * backend/services/otp_providers.py. The OTP generation/hashing/verification
 * logic (otp.service.ts) does not know or care how a code is delivered; this
 * module owns that entirely, exactly mirroring the Python split so dev/test
 * can run with no real SMS provider configured.
 */
export interface OtpProvider {
  sendOtp(phoneNumber: string, code: string, channel?: 'sms' | 'ivr'): Promise<void>;
}

export class OtpDeliveryError extends Error {}

/**
 * Development/test-only provider. Refuses to be constructed outside
 * NODE_ENV=development — the direct Node equivalent of the Python
 * SyntheticOtpProvider's constructor guard. Never sends anything externally;
 * logs the code with a loud "DEV ONLY" prefix so a developer can complete the
 * flow manually.
 */
@Injectable()
export class SyntheticOtpProvider implements OtpProvider {
  private readonly logger = new Logger(SyntheticOtpProvider.name);

  constructor(nodeEnv: string) {
    if (nodeEnv.trim().toLowerCase() !== 'development') {
      throw new Error('SyntheticOtpProvider must never be used outside NODE_ENV=development');
    }
  }

  async sendOtp(phoneNumber: string, code: string, channel: 'sms' | 'ivr' = 'sms'): Promise<void> {
    this.logger.warn(
      `[DEV ONLY — NEVER DO THIS IN PRODUCTION] Synthetic OTP for ${phoneNumber} via ${channel}: ${code}`,
    );
  }
}

/**
 * Real production provider is intentionally NOT implemented in this slice.
 *
 * The Python PushbulletOtpProvider (backend/services/otp_providers.py) was
 * already flagged in S2 as unverified against a live account — porting an
 * equally-unverified HTTP client to Node would not add real coverage, only
 * the appearance of it. This stub exists so `getOtpProvider()` below has a
 * concrete, honest failure mode outside development instead of silently
 * doing nothing or fabricating success. See docs/S4_IDENTITY_MIGRATION.md.
 */
export class UnimplementedProductionOtpProvider implements OtpProvider {
  async sendOtp(): Promise<void> {
    throw new OtpDeliveryError(
      'No OTP delivery provider is implemented for this environment. ' +
        'See docs/S4_IDENTITY_MIGRATION.md — porting a real provider (e.g. Pushbullet) ' +
        'is deliberately out of scope for the S4 identity-extraction slice.',
    );
  }
}

/**
 * Selects the OTP delivery provider for the current environment. Fails
 * closed: outside development, with no real provider implemented, this
 * always throws when actually used to send — it never silently falls back
 * to the synthetic provider (which itself would refuse construction anyway).
 */
export function getOtpProvider(nodeEnv: string): OtpProvider {
  if (nodeEnv.trim().toLowerCase() === 'development') {
    return new SyntheticOtpProvider(nodeEnv);
  }
  return new UnimplementedProductionOtpProvider();
}
