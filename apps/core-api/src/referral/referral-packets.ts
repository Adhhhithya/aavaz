import { BadRequestException } from '@nestjs/common';
import {
  LegalAidPacket,
  LegalAidStaffInput,
  MentalHealthPacket,
  MentalHealthStaffInput,
  ProtectionPacket,
  ProtectionStaffInput,
  ReferralPacket,
  StaffPacketInput,
  WelfarePacket,
  WelfareStaffInput,
} from './referral-destinations';

/** System-known fields this service is actually allowed to read for
 * packet-building — deliberately narrow (NOT the full User/Case/
 * VictimProfile rows) so a future edit to this file can't accidentally
 * widen what a packet builder has in scope. */
export interface SystemKnownFields {
  userName: string;
  preferredLanguage: string;
  phoneNumber: string;
  safeWindows: unknown;
  caseType: string;
  caseId: string;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required and must be a non-empty string`);
  }
  return value;
}

function buildMentalHealthPacket(system: SystemKnownFields, staffFields: MentalHealthStaffInput): MentalHealthPacket {
  return {
    destinationType: 'mental_health',
    alias: system.userName,
    language: system.preferredLanguage,
    callbackNumber: system.phoneNumber,
    safeWindows: system.safeWindows,
    needSummary: requireNonEmptyString(staffFields.needSummary, 'needSummary'),
  };
}

function buildLegalAidPacket(system: SystemKnownFields, staffFields: LegalAidStaffInput): LegalAidPacket {
  return {
    destinationType: 'legal_aid',
    name: system.userName,
    // cnr/court/nextHearingAt: not modeled in Node's schema yet (see
    // referral-destinations.ts's "KNOWN GAP" comment) — always null, never
    // fabricated.
    cnr: null,
    court: null,
    nextHearingAt: null,
    legalIssueSummary: requireNonEmptyString(staffFields.legalIssueSummary, 'legalIssueSummary'),
  };
}

function buildWelfarePacket(system: SystemKnownFields, staffFields: WelfareStaffInput): WelfarePacket {
  return {
    destinationType: 'welfare',
    name: system.userName,
    // fir: not modeled in Node's schema yet — always null, never fabricated.
    fir: null,
    crimeCategory: system.caseType,
    reliefStagePending: requireNonEmptyString(staffFields.reliefStagePending, 'reliefStagePending'),
    earlierApplicationDates: staffFields.earlierApplicationDates ?? [],
  };
}

function buildProtectionPacket(system: SystemKnownFields, staffFields: ProtectionStaffInput): ProtectionPacket {
  return {
    destinationType: 'protection',
    name: system.userName,
    caseIdentifiers: [system.caseId],
    threatLog: requireNonEmptyString(staffFields.threatLog, 'threatLog'),
  };
}

/**
 * The single entry point every caller uses — a destination-tagged union
 * `switch` so TypeScript itself enforces that every destination has a
 * dedicated builder with its own narrow input type (adding a 5th
 * destination without a builder here is a compile error, not a silent
 * runtime gap).
 */
export function buildReferralPacket(system: SystemKnownFields, input: StaffPacketInput): ReferralPacket {
  switch (input.destinationType) {
    case 'mental_health':
      return buildMentalHealthPacket(system, input.fields);
    case 'legal_aid':
      return buildLegalAidPacket(system, input.fields);
    case 'welfare':
      return buildWelfarePacket(system, input.fields);
    case 'protection':
      return buildProtectionPacket(system, input.fields);
  }
}
