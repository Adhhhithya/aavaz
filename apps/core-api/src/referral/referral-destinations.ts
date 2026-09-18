import { ConsentScope } from '../consent/consent-copy';

/**
 * The 4 referral destination types (v0.2 Workflow G, "Minimum necessary
 * data per destination" table, PDF page 18). Each maps 1:1 to a consent
 * scope already defined in S6 — no new scope is invented here.
 */
export const DESTINATION_TYPES = ['mental_health', 'legal_aid', 'welfare', 'protection'] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

export function isDestinationType(value: string): value is DestinationType {
  return (DESTINATION_TYPES as readonly string[]).includes(value);
}

export const CONSENT_SCOPE_BY_DESTINATION: Record<DestinationType, ConsentScope> = {
  mental_health: 'share_mental_health',
  legal_aid: 'share_legal_aid',
  welfare: 'share_welfare',
  protection: 'share_protection',
};

/**
 * Structural data-minimization enforcement (v0.2 Workflow G's "Minimum
 * necessary data per destination" table, and this milestone's explicit
 * "must be enforced structurally" instruction — flagged as a real, named
 * risk in docs/S8_DEPENDENCY_AUDIT.md section L candidate D).
 *
 * Each destination gets its OWN packet interface, containing ONLY the
 * fields that destination's row in the spec's table lists. There is no
 * shared "referral packet" supertype and no field is ever copied from one
 * destination's builder into another's — a mental-health packet's
 * TypeScript type has no `cnr`/`fir`/`crimeCategory` property to even
 * assign, and its builder function (referral-packets.ts) never receives
 * `Case`/`VictimProfile` fields it doesn't use. This makes "never
 * included" fields a compile-time property of the code, not a runtime
 * convention a future edit could quietly break.
 *
 * KNOWN GAP, stated plainly rather than fabricated: `cnr`, `fir`, `court`,
 * `nextHearingAt` are NOT modeled anywhere in Node's current Prisma schema
 * (see apps/core-api/prisma/schema.prisma's own header — `cases.cnr`/
 * `ecourts_data` are explicitly unmodeled, still FastAPI-owned). These
 * fields are always `null` in the packets below, NEVER a placeholder or
 * invented value — see docs/S9_REFERRAL_MIGRATION.md for the full
 * accounting of what each destination's packet can and cannot populate
 * automatically today, and consent-copy.ts's own precedent for "a
 * documented placeholder is acceptable; a fabricated fact is not."
 */
export interface MentalHealthPacket {
  destinationType: 'mental_health';
  alias: string;
  language: string;
  callbackNumber: string;
  safeWindows: unknown;
  needSummary: string;
}

export interface LegalAidPacket {
  destinationType: 'legal_aid';
  name: string;
  cnr: string | null;
  court: string | null;
  nextHearingAt: string | null;
  legalIssueSummary: string;
}

export interface WelfarePacket {
  destinationType: 'welfare';
  name: string;
  fir: string | null;
  crimeCategory: string;
  reliefStagePending: string;
  earlierApplicationDates: string[];
}

export interface ProtectionPacket {
  destinationType: 'protection';
  name: string;
  caseIdentifiers: string[];
  threatLog: string;
}

export type ReferralPacket = MentalHealthPacket | LegalAidPacket | WelfarePacket | ProtectionPacket;

/**
 * The staff-provided fields each destination's draft request accepts —
 * genuine case-manager knowledge (a need summary, a confirmed threat log
 * entry, a known relief stage) is legitimate human-entered content, not
 * fabrication, matching how G2 describes the case manager PREVIEWING the
 * packet before sending (implying active human authorship/review, not a
 * purely system-generated document). Required per destination because no
 * automated source exists for any of these fields today (no legal-issue
 * detection, no needs-extraction, no relief-tracking) — see
 * docs/S9_REFERRAL_MIGRATION.md.
 */
export interface MentalHealthStaffInput {
  needSummary: string;
}
export interface LegalAidStaffInput {
  legalIssueSummary: string;
}
export interface WelfareStaffInput {
  reliefStagePending: string;
  earlierApplicationDates?: string[];
}
export interface ProtectionStaffInput {
  threatLog: string;
}

export type StaffPacketInput =
  | { destinationType: 'mental_health'; fields: MentalHealthStaffInput }
  | { destinationType: 'legal_aid'; fields: LegalAidStaffInput }
  | { destinationType: 'welfare'; fields: WelfareStaffInput }
  | { destinationType: 'protection'; fields: ProtectionStaffInput };
