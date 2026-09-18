import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * Write-only fields (`duressPin`, `safeWord`) are never echoed back by any
 * controller response — see safety.controller.ts. All fields optional —
 * PATCH semantics.
 *
 * PIN format (4-8 digits) is an application-level choice, not something
 * v0.2 specifies exactly — documented here rather than left implicit.
 */
export class UpdateSafetySettingsDto {
  @IsOptional()
  @IsBoolean()
  disguiseEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'duressPin must be 4-8 digits' })
  duressPin?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  safeWord?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  trustedContactName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  trustedContactPhone?: string;
}
