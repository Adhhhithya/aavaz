import { Injectable } from '@nestjs/common';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { SafetySetting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSafetySettingsDto } from './dto/update-safety-settings.dto';

export interface SafetySettingsView {
  disguiseEnabled: boolean;
  hasDuressPin: boolean;
  hasSafeWord: boolean;
  trustedContactName: string | null;
  trustedContactPhone: string | null;
}

/**
 * Node-owned safety settings — v0.2 Workflow A5. Nothing here exists
 * anywhere in the FastAPI monolith today (no duress PIN, no disguise, no
 * trusted contact, no safe word — see
 * docs/S6_ONBOARDING_MIGRATION.md Phase 1). This is new capability, not a
 * port.
 *
 * Duress PIN and safe word are Argon2id-hashed (`@node-rs/argon2` defaults
 * to Argon2id) — the plaintext value is never persisted, never logged (no
 * log statement in this file references either value), and never returned
 * by any method or controller response; callers only ever get a boolean
 * ("hasDuressPin"/"hasSafeWord").
 *
 * v0.2 also requires the duress PIN to "differ from the login PIN" — this
 * codebase has no PIN-based login mechanism at all (authentication is
 * phone+OTP only), so there is no login PIN to compare against. This
 * constraint is NOT enforced, and is documented here as a gap rather than
 * silently ignored or satisfied by inventing a fake login-PIN field.
 *
 * The "quick-exit control" and "app disguise... neutral name and icon"
 * visual behavior from v0.2 A5 are client-side UI concerns with no
 * corresponding column in v0.2's own `safety_settings` data model beyond
 * `disguise_enabled` — nothing further is implemented or invented here.
 */
@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<SafetySettingsView> {
    const row = await this.prisma.safetySetting.findUnique({ where: { userId } });
    return this.toView(row);
  }

  /** `userId` must always come from the authenticated victim's token — the
   * controller enforces this via VictimAuthGuard + @Victim(). Only fields
   * present on `dto` are changed; an upsert is used since a victim may not
   * have a `safety_settings` row yet at all. */
  async updateSettings(userId: string, dto: UpdateSafetySettingsDto): Promise<SafetySettingsView> {
    const data: Record<string, unknown> = {};
    if (dto.disguiseEnabled !== undefined) data.disguiseEnabled = dto.disguiseEnabled;
    if (dto.duressPin !== undefined) data.duressPinHash = await argon2Hash(dto.duressPin);
    if (dto.safeWord !== undefined) data.safeWordHash = await argon2Hash(dto.safeWord);
    if (dto.trustedContactName !== undefined) data.trustedContactName = dto.trustedContactName;
    if (dto.trustedContactPhone !== undefined) data.trustedContactPhone = dto.trustedContactPhone;

    const row = await this.prisma.safetySetting.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.toView(row);
  }

  /** Server-side-only verification (Phase 6's explicit requirement) — there
   * is no client-reachable endpoint for this in this slice; live-call
   * duress detection is `agent-svc`/session-time logic, out of scope here
   * (see docs/S6_ONBOARDING_MIGRATION.md Phase 6). Returns false (not an
   * error) both when the PIN is wrong AND when no PIN has been set at all —
   * callers cannot distinguish "wrong PIN" from "no PIN configured" from
   * the return value alone, which avoids leaking configuration state. */
  async verifyDuressPin(userId: string, pin: string): Promise<boolean> {
    const row = await this.prisma.safetySetting.findUnique({ where: { userId } });
    if (!row?.duressPinHash) return false;
    return argon2Verify(row.duressPinHash, pin);
  }

  private toView(row: SafetySetting | null): SafetySettingsView {
    return {
      disguiseEnabled: row?.disguiseEnabled ?? false,
      hasDuressPin: !!row?.duressPinHash,
      hasSafeWord: !!row?.safeWordHash,
      trustedContactName: row?.trustedContactName ?? null,
      trustedContactPhone: row?.trustedContactPhone ?? null,
    };
  }
}
