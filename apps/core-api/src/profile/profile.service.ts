import { Injectable } from '@nestjs/common';
import { Prisma, VictimProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

/**
 * Node-owned victim profile/preferences. FastAPI has no read/update
 * endpoint for any of these fields at all — registration only ever WRITES
 * an initial profile-shaped payload once (see
 * docs/S6_ONBOARDING_MIGRATION.md Phase 1); there is no existing behavior
 * to port for reading or changing it afterward.
 *
 * `victim_profiles` is a 1:1 extension of `users`, keyed by `userId` — this
 * is not a second victim record (Phase 5's explicit constraint): the only
 * identity-bearing row remains `users`, owned by the identity module.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<VictimProfile> {
    const existing = await this.prisma.victimProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    // No row yet — return a stable, all-null shape rather than 404, so
    // callers don't need two different response shapes for "never set" vs.
    // "explicitly cleared".
    return {
      userId,
      relationType: null,
      preferredChannel: null,
      safeWindows: null,
      safeToCall: null,
      updatedAt: new Date(0),
    };
  }

  /** `userId` must always come from the authenticated victim's token — the
   * controller enforces this via VictimAuthGuard + @Victim(). Only fields
   * present on `dto` are changed (PATCH semantics); an upsert is used since
   * a victim may not have a `victim_profiles` row yet at all. */
  async updateProfile(userId: string, dto: UpdatePreferencesDto): Promise<VictimProfile> {
    const data = {
      ...(dto.relationType !== undefined && { relationType: dto.relationType }),
      ...(dto.preferredChannel !== undefined && { preferredChannel: dto.preferredChannel }),
      ...(dto.safeWindows !== undefined && { safeWindows: dto.safeWindows as unknown as Prisma.InputJsonValue }),
      ...(dto.safeToCall !== undefined && { safeToCall: dto.safeToCall }),
    };

    return this.prisma.victimProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
