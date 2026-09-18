import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuditService } from '../staff/staff-audit.service';
import { StaffService } from '../staff/staff.service';
import { TaskService } from '../task/task.service';
import { ReferralService } from './referral.service';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

describe('ReferralService', () => {
  let fake: FakePrismaService;
  let staffService: StaffService;
  let auditService: StaffAuditService;
  let taskService: TaskService;
  let referralService: ReferralService;

  beforeEach(() => {
    fake = new FakePrismaService();
    staffService = new StaffService(fake as unknown as PrismaService);
    auditService = new StaffAuditService(fake as unknown as PrismaService);
    taskService = new TaskService(fake as unknown as PrismaService, auditService);
    referralService = new ReferralService(fake as unknown as PrismaService, auditService, taskService);
  });

  function seedUser(over: Partial<{ id: string; locationDistrict: string | null; name: string }> = {}) {
    const row = {
      id: over.id ?? nextId('user'),
      phoneNumber: `+9100000${seq}`,
      name: over.name ?? 'Synthetic Victim',
      roleType: 'victim',
      preferredLanguage: 'en',
      consentGiven: true,
      consentTimestamp: null,
      locationDistrict: over.locationDistrict ?? null,
      locationState: null,
      locationSource: null,
      locationLat: null,
      locationLng: null,
      createdAt: new Date(),
    };
    fake.userRows.push(row);
    return row;
  }

  function seedCase(over: { userId: string | null; assignedCounsellorId?: string | null; caseType?: string }) {
    const row = {
      id: nextId('case'),
      userId: over.userId,
      caseType: over.caseType ?? 'unspecified',
      intakeChannel: 'app',
      caseStage: 'registered',
      assignedCounsellorId: over.assignedCounsellorId ?? null,
      currentDistressScore: 42, // deliberately non-null and "interesting" —
      // used to prove no packet builder ever leaks this value (see the
      // data-minimization describe block below).
      priorityRank: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lifecycleState: 'MONITORING',
      lifecycleUpdatedAt: new Date(),
    };
    fake.caseRows.push(row);
    return row;
  }

  // Monotonically increasing, not wall-clock — two consent rows seeded in
  // the same test can land in the same millisecond under real Date.now(),
  // which would make "most recent row wins" ordering nondeterministic.
  let consentClock = 0;
  function seedConsent(userId: string, scope: string, granted: boolean) {
    consentClock += 1;
    fake.consentRows.push({
      id: nextId('consent'),
      userId,
      scope,
      granted,
      textVersionHash: 'hash',
      channel: 'app',
      capturedBy: 'self',
      capturedAt: new Date(consentClock),
    });
  }

  async function seedDistrictStaff(district = 'Pune') {
    return staffService.createStaff({ userId: nextId('user'), role: 'district_admin', districtScope: [district] });
  }

  describe('role gating', () => {
    it('state_admin cannot draft a referral — oversight-tier roles are excluded, same as S7/S8', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'state_admin' });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      await expect(
        referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'Wants someone to talk to' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assignment/district authorization', () => {
    it('a counsellor can draft a referral for a case assigned to their linked counsellor identity', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-A' });

      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'Needs support' });
      expect(referral.status).toBe('DRAFTED');
    });

    it('a counsellor cannot draft a referral for a case assigned to a different counsellor', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-OTHER' });

      await expect(
        referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'Needs support' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a district_admin cannot draft a referral for a case outside their district_scope', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Mumbai' });
      const kase = seedCase({ userId: victim.id });

      await expect(
        referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'Needs support' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a nonexistent case id and an out-of-scope case produce the SAME denial', async () => {
      const staff = await seedDistrictStaff('Pune');

      let nonexistentError: unknown;
      try {
        await referralService.draft(staff, 'not-a-real-case-id', 'mental_health', { needSummary: 'x' });
      } catch (e) {
        nonexistentError = e;
      }

      const outOfScopeVictim = seedUser({ locationDistrict: 'Mumbai' });
      const outOfScopeCase = seedCase({ userId: outOfScopeVictim.id });
      let outOfScopeError: unknown;
      try {
        await referralService.draft(staff, outOfScopeCase.id, 'mental_health', { needSummary: 'x' });
      } catch (e) {
        outOfScopeError = e;
      }

      expect(nonexistentError).toBeInstanceOf(ForbiddenException);
      expect(outOfScopeError).toBeInstanceOf(ForbiddenException);
      expect((nonexistentError as ForbiddenException).message).toBe((outOfScopeError as ForbiddenException).message);
    });

    it('transition() and get() enforce the same case-scope check as draft()', async () => {
      const staff = await seedDistrictStaff('Pune');
      const otherStaff = await seedDistrictStaff('Mumbai');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });

      await expect(referralService.get(otherStaff, referral.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(referralService.transition(otherStaff, referral.id, 'APPROVED')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('data minimization (structural, per referral-destinations.ts)', () => {
    it('a mental_health packet contains only the mental-health field set — never distress score, FIR, or crime details', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune', name: 'Synthetic Alias' });
      const kase = seedCase({ userId: victim.id, caseType: 'assault' });

      const referral = await referralService.draft(staff, kase.id, 'mental_health', {
        needSummary: 'Wants to talk about anxiety',
      });

      const packet = referral.packetData as Record<string, unknown>;
      expect(Object.keys(packet).sort()).toEqual(
        ['alias', 'callbackNumber', 'destinationType', 'language', 'needSummary', 'safeWindows'].sort(),
      );
      expect(JSON.stringify(packet)).not.toContain('42'); // the distress score
      expect(packet).not.toHaveProperty('crimeCategory');
      expect(packet).not.toHaveProperty('cnr');
      expect(packet).not.toHaveProperty('fir');
    });

    it('a legal_aid packet never contains distress scores or counselling notes, and cnr/court/nextHearingAt are null, not fabricated', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      const referral = await referralService.draft(staff, kase.id, 'legal_aid', {
        legalIssueSummary: 'Possible investigation delay — flagged for legal review',
      });

      const packet = referral.packetData as Record<string, unknown>;
      expect(packet.cnr).toBeNull();
      expect(packet.court).toBeNull();
      expect(packet.nextHearingAt).toBeNull();
      expect(packet).not.toHaveProperty('distressScore');
      expect(packet).not.toHaveProperty('counsellingNotes');
      expect(packet).not.toHaveProperty('safeWindows');
    });

    it('a welfare packet pulls crimeCategory from the case but never transcripts or mental-health data', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id, caseType: 'poa_act_offence' });

      const referral = await referralService.draft(staff, kase.id, 'welfare', {
        reliefStagePending: 'First instalment pending disbursal',
      });

      const packet = referral.packetData as Record<string, unknown>;
      expect(packet.crimeCategory).toBe('poa_act_offence');
      expect(packet).not.toHaveProperty('transcripts');
      expect(packet).not.toHaveProperty('needSummary');
    });

    it('a protection packet requires a case-manager-confirmed threat log and rejects a missing one', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      await expect(referralService.draft(staff, kase.id, 'protection', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('transition validity', () => {
    it('rejects an invalid transition even for a fully authorized staff member', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });

      // DRAFTED -> SENT skips the required APPROVED step.
      await expect(referralService.transition(staff, referral.id, 'SENT')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('consent gate (v0.2 Workflow G, "G1")', () => {
    it('blocks the transition to SENT when the matching share_* consent is not granted', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'legal_aid', { legalIssueSummary: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');

      await expect(referralService.transition(staff, referral.id, 'SENT')).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows the transition to SENT once the matching consent is granted, and stamps SLA fields', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      seedConsent(victim.id, 'share_legal_aid', true);
      const referral = await referralService.draft(staff, kase.id, 'legal_aid', { legalIssueSummary: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');

      const sent = await referralService.transition(staff, referral.id, 'SENT');
      expect(sent.status).toBe('SENT');
      expect(sent.sentAt).not.toBeNull();
      expect(sent.ackDueAt).not.toBeNull();
      expect(sent.attemptCount).toBe(1);
      expect(sent.idempotencyKey).toBe(`${referral.id}:1`);
    });

    it('a REVOKED consent (most recent row is granted:false) blocks SENT even if an earlier row was granted', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      seedConsent(victim.id, 'share_welfare', true);
      seedConsent(victim.id, 'share_welfare', false); // revoked afterward
      const referral = await referralService.draft(staff, kase.id, 'welfare', { reliefStagePending: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');

      await expect(referralService.transition(staff, referral.id, 'SENT')).rejects.toBeInstanceOf(ConflictException);
    });

    it('the consent gate applies uniformly to a bounce-retry, not just the first send', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      seedConsent(victim.id, 'share_mental_health', true);
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');
      await referralService.transition(staff, referral.id, 'SENT');
      await referralService.transition(staff, referral.id, 'BOUNCED');

      // Consent is revoked between the first send and the retry.
      seedConsent(victim.id, 'share_mental_health', false);

      await expect(referralService.transition(staff, referral.id, 'SENT')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('SLA stamping', () => {
    it('stamps ackedAt and computes serviceDueAt when acknowledged', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      seedConsent(victim.id, 'share_protection', true);
      const referral = await referralService.draft(staff, kase.id, 'protection', { threatLog: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');
      await referralService.transition(staff, referral.id, 'SENT');

      const acked = await referralService.transition(staff, referral.id, 'ACKNOWLEDGED');
      expect(acked.ackedAt).not.toBeNull();
      expect(acked.serviceDueAt).not.toBeNull();
    });

    it('stamps deliveredAt and verifiedAt along the full happy path', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      seedConsent(victim.id, 'share_protection', true);
      const referral = await referralService.draft(staff, kase.id, 'protection', { threatLog: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');
      await referralService.transition(staff, referral.id, 'SENT');
      await referralService.transition(staff, referral.id, 'ACKNOWLEDGED');
      await referralService.transition(staff, referral.id, 'IN_SERVICE');
      const delivered = await referralService.transition(staff, referral.id, 'DELIVERED');
      expect(delivered.deliveredAt).not.toBeNull();
      const verified = await referralService.transition(staff, referral.id, 'VERIFIED');
      expect(verified.verifiedAt).not.toBeNull();
    });
  });

  describe('concurrency safety', () => {
    it('a stale conditional update (status changed underneath it) is rejected with a real conflict', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });

      const originalFindUnique = fake.referral.findUnique.bind(fake.referral);
      fake.referral.findUnique = (async (args: Parameters<typeof originalFindUnique>[0]) => {
        const result = await originalFindUnique(args);
        const row = fake.referralRows.find((r) => r.id === referral.id)!;
        row.status = 'CLOSED_UNRESOLVED'; // another "request" committed first — but this
        // is an unreachable state from DRAFTED, so any transition still
        // attempted against the stale read must be rejected as a conflict,
        // not silently applied.
        return result;
      }) as typeof fake.referral.findUnique;

      await expect(referralService.transition(staff, referral.id, 'APPROVED')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(fake.referralRows.find((r) => r.id === referral.id)?.status).toBe('CLOSED_UNRESOLVED');
    });
  });

  describe('S12: STALLED transition creates a follow-up task', () => {
    it('reaching STALLED creates a referral_stalled task in the same case, via TaskService', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      seedConsent(victim.id, 'share_mental_health', true);
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');
      await referralService.transition(staff, referral.id, 'SENT');

      await referralService.transition(staff, referral.id, 'STALLED');

      expect(fake.taskRows).toHaveLength(1);
      const task = fake.taskRows[0];
      expect(task.type).toBe('referral_stalled');
      expect(task.referralId).toBe(referral.id);
      expect(task.caseId).toBe(kase.id);
      expect(task.createdByStaffId).toBeNull();
    });

    it('a transition that does NOT reach STALLED never creates a task', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });

      await referralService.transition(staff, referral.id, 'APPROVED');

      expect(fake.taskRows).toHaveLength(0);
    });
  });

  describe('S16: one-time acknowledgement token', () => {
    async function driveToSent(): Promise<{ referralId: string; rawAckToken: string }> {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      seedConsent(victim.id, 'share_mental_health', true);
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });
      await referralService.transition(staff, referral.id, 'APPROVED');
      const sent = await referralService.transition(staff, referral.id, 'SENT');
      expect(sent.rawAckToken).toBeDefined();
      return { referralId: referral.id, rawAckToken: sent.rawAckToken! };
    }

    it('the SENT transition response carries a raw token not persisted anywhere in plaintext', async () => {
      const { referralId, rawAckToken } = await driveToSent();
      const row = fake.referralRows.find((r) => r.id === referralId)!;
      expect(row.ackTokenHash).not.toBeNull();
      expect(row.ackTokenHash).not.toBe(rawAckToken); // only the HASH is stored
    });

    it('a later SENT (bounce then retry) issues a NEW token that invalidates the old one', async () => {
      const { referralId, rawAckToken: firstToken } = await driveToSent();
      const staff = await seedDistrictStaff('Pune');
      await referralService.transition(staff, referralId, 'BOUNCED');
      const resent = await referralService.transition(staff, referralId, 'SENT');

      expect(resent.rawAckToken).toBeDefined();
      expect(resent.rawAckToken).not.toBe(firstToken);
      // The OLD token must no longer work.
      await expect(referralService.acknowledgeViaToken(firstToken)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('acknowledgeViaToken transitions SENT -> ACKNOWLEDGED and returns a reference number', async () => {
      const { referralId, rawAckToken } = await driveToSent();
      const result = await referralService.acknowledgeViaToken(rawAckToken);
      expect(result.referenceNumber).toBe(referralId);

      const row = fake.referralRows.find((r) => r.id === referralId)!;
      expect(row.status).toBe('ACKNOWLEDGED');
      expect(row.ackedAt).not.toBeNull();
      expect(row.serviceDueAt).not.toBeNull();
    });

    it('the SAME token cannot be used twice — the second attempt gets the same generic error', async () => {
      const { rawAckToken } = await driveToSent();
      await referralService.acknowledgeViaToken(rawAckToken);

      await expect(referralService.acknowledgeViaToken(rawAckToken)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a wrong/guessed token gets the SAME generic error as an already-used one — no information leakage', async () => {
      await expect(referralService.acknowledgeViaToken('completely-made-up-token-value')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('if a staff member manually acknowledges first, the token stops working — no separate bookkeeping needed', async () => {
      const { referralId, rawAckToken } = await driveToSent();
      const staff = await seedDistrictStaff('Pune');
      await referralService.transition(staff, referralId, 'ACKNOWLEDGED');

      await expect(referralService.acknowledgeViaToken(rawAckToken)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getAckInfo returns ONLY a reference number — no victim content, no packet data', async () => {
      const { referralId, rawAckToken } = await driveToSent();
      const info = await referralService.getAckInfo(rawAckToken);
      expect(Object.keys(info)).toEqual(['referenceNumber']);
      expect(info.referenceNumber).toBe(referralId);
    });

    it('getAckInfo rejects a wrong token with the same generic error, and does not mutate state', async () => {
      await expect(referralService.getAckInfo('not-a-real-token')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no audit row is written for a public token-based acknowledgement — there is no staff actor to attribute it to', async () => {
      const { rawAckToken } = await driveToSent();
      const auditRowsBefore = fake.staffAuditLogRows.length;
      await referralService.acknowledgeViaToken(rawAckToken);
      expect(fake.staffAuditLogRows).toHaveLength(auditRowsBefore);
    });

    it('get() and draft() responses never carry rawAckToken — it only ever appears on the SENT transition\'s own response', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });
      expect(referral.rawAckToken).toBeUndefined();

      const fetched = await referralService.get(staff, referral.id);
      expect(fetched.rawAckToken).toBeUndefined();
    });
  });

  describe('audit hook', () => {
    it('records a draft and a transition as id/code rows, never packet content', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'mental_health', {
        needSummary: 'SENSITIVE_NARRATIVE_MARKER',
      });
      await referralService.transition(staff, referral.id, 'APPROVED');

      expect(fake.staffAuditLogRows).toHaveLength(2);
      expect(fake.staffAuditLogRows[0].action).toBe('referral.drafted');
      expect(fake.staffAuditLogRows[0].resourceType).toBe('referral');
      expect(fake.staffAuditLogRows[1].action).toBe('referral.transition');
      for (const entry of fake.staffAuditLogRows) {
        expect(JSON.stringify(entry)).not.toContain('SENSITIVE_NARRATIVE_MARKER');
      }
    });

    it('does NOT record an audit entry for a denied draft attempt', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Mumbai' });
      const kase = seedCase({ userId: victim.id });

      await expect(
        referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(fake.staffAuditLogRows).toHaveLength(0);
    });

    it('does NOT record an audit entry for a rejected (invalid) transition', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = await referralService.draft(staff, kase.id, 'mental_health', { needSummary: 'x' });

      await expect(referralService.transition(staff, referral.id, 'SENT')).rejects.toBeInstanceOf(ConflictException);
      // Exactly the one 'referral.drafted' entry from draft() above — no
      // second entry for the rejected transition.
      expect(fake.staffAuditLogRows).toHaveLength(1);
    });
  });
});
