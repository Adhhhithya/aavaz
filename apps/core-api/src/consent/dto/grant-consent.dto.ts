import { IsBoolean, IsIn } from 'class-validator';
import { CONSENT_SCOPES, ConsentScope } from '../consent-copy';

/** Channel this specific consent grant was captured over. Deliberately not
 * the same enum as `channel_enum` (case interaction channel) — see
 * backend/migrations/0004_consent_profile_safety.sql's header note. */
export const CONSENT_CAPTURE_CHANNELS = ['app', 'web', 'ivr', 'sms'] as const;
export type ConsentCaptureChannel = (typeof CONSENT_CAPTURE_CHANNELS)[number];

/**
 * Deliberately has NO `textVersionHash` or `text` field — the server always
 * resolves the current consent copy for `scope` itself
 * (consent-copy.ts::currentConsentCopy) and hashes that; a client can never
 * supply its own text or hash as if it were what was actually shown. See
 * docs/S6_ONBOARDING_MIGRATION.md Phase 4.
 */
export class GrantConsentDto {
  @IsIn(CONSENT_SCOPES)
  scope!: ConsentScope;

  @IsBoolean()
  granted!: boolean;

  @IsIn(CONSENT_CAPTURE_CHANNELS)
  channel!: ConsentCaptureChannel;
}
