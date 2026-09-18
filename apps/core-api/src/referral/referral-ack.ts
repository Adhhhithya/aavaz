import * as crypto from 'crypto';

/**
 * The one-time referral acknowledgement token (v0.2 §14: `POST
 * /v1/ack/{token}`; Workflow H: "Receivers acknowledge via a one-time
 * link (no login, shows nothing but an Acknowledge button and reference
 * number)").
 *
 * 256 bits of entropy (`crypto.randomBytes(32)`) — unlike `otp_codes`
 * (S2/S4), which is a short 6-digit value that genuinely needs a
 * server-side pepper to resist brute force (its own input space is only
 * 10^6), a 256-bit random secret is not meaningfully strengthened by an
 * additional pepper, so a PLAIN SHA-256 hash of the raw token is stored
 * — a deliberate difference from the OTP pattern, not an inconsistency.
 * The raw token itself is returned to staff exactly once (in
 * ReferralService.transition's response, only for the SENT transition
 * that generated it) — never persisted anywhere in plaintext, never
 * logged, never returned again by any later read.
 */
export function generateAckToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashAckToken(rawToken) };
}

export function hashAckToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
