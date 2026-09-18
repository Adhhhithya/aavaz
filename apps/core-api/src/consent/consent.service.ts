import { Injectable } from '@nestjs/common';
import { Consent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentConsentCopy, hashConsentCopy } from './consent-copy';
import { GrantConsentDto } from './dto/grant-consent.dto';

/**
 * Node-owned consent handling — the FastAPI monolith has no equivalent at
 * all beyond a single `users.consent_given` boolean captured once at
 * registration (see docs/S6_ONBOARDING_MIGRATION.md Phase 1). This is new
 * capability, not a port of existing behavior.
 *
 * APPEND-ONLY, per v0.2 Workflow A2 ("each grant writes a row"): every call
 * to `grantConsent` inserts a new row rather than updating one in place, so
 * the full history of grants/revocations for a scope is preserved. The
 * "current" value for a scope is simply its most recent row.
 */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `userId` must always come from the authenticated victim's token (the
   * controller enforces this via VictimAuthGuard + @Victim()) — this
   * service has no path that accepts a client-supplied victim id.
   */
  async grantConsent(userId: string, dto: GrantConsentDto): Promise<Consent> {
    const copy = currentConsentCopy(dto.scope);
    const textVersionHash = hashConsentCopy(copy);

    return this.prisma.consent.create({
      data: {
        userId,
        scope: dto.scope,
        granted: dto.granted,
        textVersionHash,
        channel: dto.channel,
        capturedBy: 'self', // assisted-onboarding capture is not implemented in this slice
      },
    });
  }

  /**
   * Returns only the CURRENT (most recent) row per scope the victim has
   * ever acted on — a scope with no rows at all is simply absent from the
   * result, never fabricated as `granted: false`.
   */
  async getCurrentConsents(userId: string): Promise<Consent[]> {
    const rows = await this.prisma.consent.findMany({
      where: { userId },
      orderBy: { capturedAt: 'desc' },
    });

    const latestByScope = new Map<string, Consent>();
    for (const row of rows) {
      if (!latestByScope.has(row.scope)) {
        latestByScope.set(row.scope, row);
      }
    }
    return [...latestByScope.values()];
  }
}
