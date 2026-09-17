import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

// Mirrors the enum values in prisma/schema.prisma (RoleType / PreferredLanguage),
// which themselves mirror backend/schema.sql's role_type_enum / lang_enum exactly.
export enum RoleTypeInput {
  victim = 'victim',
  witness = 'witness',
  family = 'family',
}

export enum PreferredLanguageInput {
  hi = 'hi',
  ta = 'ta',
  ml = 'ml',
  en = 'en',
}

class LocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

/**
 * Deliberately has NO phoneNumber field (see PhoneVerifiedGuard) — the
 * phone number is derived server-side from a phone-verified token, never
 * accepted from the client, exactly mirroring the S2 fix to the Python
 * AppRegistrationRequest model.
 *
 * This is the IDENTITY-ONLY subset of the existing FastAPI registration
 * payload — it intentionally does not create a case or run counsellor
 * assignment (see docs/S4_IDENTITY_MIGRATION.md).
 */
export class RegisterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(RoleTypeInput)
  roleType!: RoleTypeInput;

  @IsBoolean()
  consentGiven!: boolean;

  @IsEnum(PreferredLanguageInput)
  preferredLanguage!: PreferredLanguageInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}
