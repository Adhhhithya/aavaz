import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Closed sets of short codes — not free text — matching
 * backend/migrations/0005_staff.sql's "IDs and codes, never free text"
 * design intent (echoing v0.2's own event-catalog convention, §13:
 * "Events carry IDs and codes, never free-text victim content").
 */
export type StaffAuditAction = 'console.queue.read' | 'console.victim.read';
export type StaffAuditResourceType = 'queue' | 'victim';

/**
 * The ONLY writer of `staff_audit_log`. Its method signature is
 * structurally incapable of accepting victim transcript text, a token, a
 * PIN, or any other secret — there is no parameter for any of those, by
 * design, not by convention. `resourceId` is always an id (e.g. a victim's
 * `users.id`), never content.
 *
 * Records only SUCCESSFUL reads, matching v0.2 §15's own phrasing ("every
 * READ of victim content is logged") — denied attempts are not recorded
 * in this slice; a future milestone may extend this if denial-logging
 * becomes a requirement, but that is not claimed here.
 *
 * This is NOT v0.2's full hash-chained/WORM audit subsystem — see
 * backend/migrations/0005_staff.sql's header for why that is a documented
 * boundary, not an oversight.
 */
@Injectable()
export class StaffAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    staffId: string,
    action: StaffAuditAction,
    resourceType: StaffAuditResourceType,
    resourceId?: string,
  ): Promise<void> {
    await this.prisma.staffAuditLog.create({
      data: {
        staffId,
        action,
        resourceType,
        resourceId: resourceId ?? null,
      },
    });
  }
}
