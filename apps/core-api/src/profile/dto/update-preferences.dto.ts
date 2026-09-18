import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

/** v0.2 Workflow A3: "relation to case (survivor or family member)" —
 * deliberately narrower than the existing users.role_type_enum
 * (victim/witness/family), which stays identity-owned. */
export const RELATION_TYPES = ['survivor', 'family_member'] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** Same literal values as consent/dto/grant-consent.dto.ts's
 * CONSENT_CAPTURE_CHANNELS today, but a distinct concept (the victim's
 * preferred contact channel going forward, not which channel a past
 * consent grant happened over) — kept as its own local constant rather
 * than an artificial cross-module import. */
export const PREFERRED_CHANNELS = ['app', 'web', 'ivr', 'sms'] as const;
export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];

class SafeWindowDto {
  @IsString()
  @MinLength(1)
  day!: string;

  @IsString()
  @MinLength(1)
  start!: string;

  @IsString()
  @MinLength(1)
  end!: string;
}

/**
 * All fields optional — PATCH semantics, only supplied fields are updated.
 * Deliberately does NOT include name/language/district: those already
 * exist on the identity-owned `users` table (S4/S5) and are not duplicated
 * here — see docs/S6_ONBOARDING_MIGRATION.md Phase 5. Also deliberately
 * does NOT include crime category: v0.2's own data model (§12) places
 * `crime_category` on `cases`, not on the victim/profile row — out of this
 * module's scope, tracked as a case-domain gap instead.
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(RELATION_TYPES)
  relationType?: RelationType;

  @IsOptional()
  @IsIn(PREFERRED_CHANNELS)
  preferredChannel?: PreferredChannel;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafeWindowDto)
  safeWindows?: SafeWindowDto[];

  @IsOptional()
  @IsBoolean()
  safeToCall?: boolean;
}
