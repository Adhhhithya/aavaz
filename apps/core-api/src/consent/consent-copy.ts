import * as crypto from 'crypto';

/**
 * The seven consent scopes defined by
 * docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf, Workflow A2. Only
 * `monitoring` is explicitly marked "(required)" in the spec — every other
 * scope is, by omission, optional. Nothing here treats an unlisted scope as
 * valid; DTOs reject anything outside this list.
 */
export const CONSENT_SCOPES = [
  'monitoring',
  'store_transcripts',
  'voice_recording',
  'share_mental_health',
  'share_legal_aid',
  'share_welfare',
  'share_protection',
] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const REQUIRED_CONSENT_SCOPES: readonly ConsentScope[] = ['monitoring'];

export interface ConsentCopyVersion {
  version: string;
  text: string;
}

/**
 * PLACEHOLDER APPLICATION COPY — NOT REVIEWED LEGAL LANGUAGE.
 *
 * v0.2 requires "the SHA-256 hash of the exact consent text version shown"
 * but does not itself specify final legal wording for any scope (the spec's
 * own cover page says statutory references are placeholders pending legal
 * review). Per this milestone's explicit instruction not to invent legal
 * consent language, every value below is a clearly-labeled placeholder,
 * configurable at this single location — not fabricated statutory text, and
 * not sourced from any legal reviewer. Replace these values (and bump the
 * version string) once real, reviewed consent copy exists for each scope;
 * every historical `consents` row keeps the hash of whatever copy was
 * actually shown at the time, so replacing this map never rewrites history.
 *
 * The server is the ONLY place these are resolved — see
 * consent.service.ts::grantConsent. A client can never supply its own text
 * or hash; it can only say which scope, and whether it grants or revokes.
 */
export const CONSENT_COPY: Record<ConsentScope, ConsentCopyVersion> = {
  monitoring: {
    version: 'v1',
    text: 'PLACEHOLDER COPY v1 (monitoring): I agree that Aavaz may check in with me periodically about my wellbeing and case progress. This is a placeholder pending legal review.',
  },
  store_transcripts: {
    version: 'v1',
    text: 'PLACEHOLDER COPY v1 (store_transcripts): I agree that Aavaz may keep a record of my conversations with the support service. This is a placeholder pending legal review.',
  },
  voice_recording: {
    version: 'v1',
    text: 'PLACEHOLDER COPY v1 (voice_recording): I agree that Aavaz may record my voice during phone calls with the support service. This is a placeholder pending legal review.',
  },
  share_mental_health: {
    version: 'v1',
    text: 'PLACEHOLDER COPY v1 (share_mental_health): I agree that Aavaz may share relevant information with mental health support services on my behalf. This is a placeholder pending legal review.',
  },
  share_legal_aid: {
    version: 'v1',
    text: 'PLACEHOLDER COPY v1 (share_legal_aid): I agree that Aavaz may share relevant information with legal aid services on my behalf. This is a placeholder pending legal review.',
  },
  share_welfare: {
    version: 'v1',
    text: 'PLACEHOLDER COPY v1 (share_welfare): I agree that Aavaz may share relevant information with welfare/relief schemes on my behalf. This is a placeholder pending legal review.',
  },
  share_protection: {
    version: 'v1',
    text: 'PLACEHOLDER COPY v1 (share_protection): I agree that Aavaz may share relevant information with protection services (e.g. police, One Stop Centres) on my behalf. This is a placeholder pending legal review.',
  },
};

export function currentConsentCopy(scope: ConsentScope): ConsentCopyVersion {
  return CONSENT_COPY[scope];
}

export function hashConsentCopy(copy: ConsentCopyVersion): string {
  return crypto.createHash('sha256').update(`${copy.version}:${copy.text}`).digest('hex');
}
