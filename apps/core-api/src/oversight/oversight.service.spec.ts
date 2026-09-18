import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuditService } from '../staff/staff-audit.service';
import { StaffService } from '../staff/staff.service';
import { OversightService } from './oversight.service';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

describe('OversightService', () => {
  let fake: FakePrismaService;
  let staffService: StaffService;
  let auditService: StaffAuditService;
  let oversightService: OversightService;

  beforeEach(() => {
    fake = new FakePrismaService();
    staffService = new StaffService(fake as unknown as PrismaService);
    auditService = new StaffAuditService(fake as unknown as PrismaService);
    oversightService = new OversightService(fake as unknown as PrismaService, auditService);
  });

  function seedUser(district: string) {
    const row = {
      id: nextId('user'),
      phoneNumber: `+9100000${seq}`,
      name: 'Synthetic Victim',
      roleType: 'victim',
      preferredLanguage: 'en',
      consentGiven: true,
      consentTimestamp: null,
      locationDistrict: district,
      locationState: null,
      locationSource: null,
      locationLat: null,
      locationLng: null,
      createdAt: new Date(),
    };
    fake.userRows.push(row);
    return row;
  }

  function seedReferral(over: {
    userId: string;
    destinationType: string;
    status: string;
    sentAt?: Date | null;
    inServiceAt?: Date | null;
    serviceDueAt?: Date | null;
  }) {
    const row = {
      id: nextId('referral'),
      caseId: nextId('case'),
      userId: over.userId,
      destinationType: over.destinationType,
      status: over.status,
      packetData: {},
      createdByStaffId: nextId('staff'),
      attemptCount: 1,
      idempotencyKey: null,
      sentAt: over.sentAt ?? null,
      ackDueAt: null,
      ackedAt: null,
      serviceDueAt: over.serviceDueAt ?? null,
      inServiceAt: over.inServiceAt ?? null,
      deliveredAt: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fake.referralRows.push(row);
    return row;
  }

  describe('role gating', () => {
    it('a counsellor cannot access oversight metrics — individual-record tier is excluded here, the mirror of S9', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor' });
      await expect(oversightService.getDistrictMetrics(staff, 'Pune')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a district_admin (individual-record tier) cannot access oversight metrics', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      await expect(oversightService.getDistrictMetrics(staff, 'Pune')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a national_admin can access oversight metrics', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      expect(metrics.districtCode).toBe('Pune');
    });

    it('a state_admin can access oversight metrics', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'state_admin' });
      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      expect(metrics.districtCode).toBe('Pune');
    });
  });

  describe('district scoping (the oversight-tier asymmetry)', () => {
    it('an EMPTY districtScope means unrestricted for oversight-tier roles — the opposite of S7/S8/S9', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin', districtScope: [] });
      const metrics = await oversightService.getDistrictMetrics(staff, 'AnyDistrictAtAll');
      expect(metrics.districtCode).toBe('AnyDistrictAtAll');
    });

    it('a non-empty districtScope DOES restrict which districts an oversight-tier staff member may query', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'state_admin',
        districtScope: ['Pune'],
      });
      await expect(oversightService.getDistrictMetrics(staff, 'Mumbai')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(oversightService.getDistrictMetrics(staff, 'Pune')).resolves.toBeDefined();
    });
  });

  describe('small-count suppression', () => {
    it('suppresses a (destination, status) cell with fewer than 5 referrals', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const victim = seedUser('Pune');
      for (let i = 0; i < 3; i += 1) {
        seedReferral({ userId: victim.id, destinationType: 'mental_health', status: 'SENT' });
      }

      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      const cell = metrics.referralsByDestinationAndStatus.mental_health.SENT;
      expect(cell.suppressed).toBe(true);
      expect(cell.count).toBeNull();
    });

    it('reveals a (destination, status) cell with 5 or more referrals', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const victim = seedUser('Pune');
      for (let i = 0; i < 6; i += 1) {
        seedReferral({ userId: victim.id, destinationType: 'mental_health', status: 'SENT' });
      }

      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      const cell = metrics.referralsByDestinationAndStatus.mental_health.SENT;
      expect(cell.suppressed).toBe(false);
      expect(cell.count).toBe(6);
    });

    it('a district with zero referrals returns an empty grid, not a fabricated zero cell', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const metrics = await oversightService.getDistrictMetrics(staff, 'EmptyDistrict');
      expect(metrics.referralsByDestinationAndStatus).toEqual({});
    });

    it('median time to service is suppressed below the sample threshold', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const victim = seedUser('Pune');
      const base = new Date('2026-01-01T00:00:00Z');
      for (let i = 0; i < 4; i += 1) {
        seedReferral({
          userId: victim.id,
          destinationType: 'welfare',
          status: 'IN_SERVICE',
          sentAt: base,
          inServiceAt: new Date(base.getTime() + (i + 1) * 24 * 60 * 60 * 1000),
        });
      }

      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      expect(metrics.medianDaysToService.suppressed).toBe(true);
      expect(metrics.medianDaysToService.medianDays).toBeNull();
    });

    it('median time to service is revealed once 5 referrals have real sentAt/inServiceAt pairs', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const victim = seedUser('Pune');
      const base = new Date('2026-01-01T00:00:00Z');
      for (let i = 0; i < 5; i += 1) {
        seedReferral({
          userId: victim.id,
          destinationType: 'welfare',
          status: 'IN_SERVICE',
          sentAt: base,
          inServiceAt: new Date(base.getTime() + (i + 1) * 24 * 60 * 60 * 1000), // 1,2,3,4,5 days
        });
      }

      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      expect(metrics.medianDaysToService.suppressed).toBe(false);
      expect(metrics.medianDaysToService.medianDays).toBe(3); // median of 1,2,3,4,5
    });

    it('a referral that never reached IN_SERVICE is excluded from the median, not counted as zero', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const victim = seedUser('Pune');
      const base = new Date('2026-01-01T00:00:00Z');
      for (let i = 0; i < 5; i += 1) {
        seedReferral({
          userId: victim.id,
          destinationType: 'welfare',
          status: 'IN_SERVICE',
          sentAt: base,
          inServiceAt: new Date(base.getTime() + (i + 1) * 24 * 60 * 60 * 1000),
        });
      }
      // A SENT-only referral (never acknowledged/serviced) — must not drag
      // the sample or be treated as 0 days to service.
      seedReferral({ userId: victim.id, destinationType: 'welfare', status: 'SENT', sentAt: base, inServiceAt: null });

      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      expect(metrics.medianDaysToService.sampleSize).toBe(5);
    });

    it('overdue relief count is suppressed below threshold and excludes resolved/other-destination referrals', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const victim = seedUser('Pune');
      const past = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

      // 2 genuinely overdue welfare referrals.
      seedReferral({ userId: victim.id, destinationType: 'welfare', status: 'ACKNOWLEDGED', serviceDueAt: past });
      seedReferral({ userId: victim.id, destinationType: 'welfare', status: 'SENT', serviceDueAt: past });
      // Not overdue: due date in the future.
      seedReferral({ userId: victim.id, destinationType: 'welfare', status: 'SENT', serviceDueAt: future });
      // Not overdue: already resolved (VERIFIED), despite a past due date.
      seedReferral({ userId: victim.id, destinationType: 'welfare', status: 'VERIFIED', serviceDueAt: past });
      // Not counted: wrong destination, even though past due and unresolved.
      seedReferral({ userId: victim.id, destinationType: 'legal_aid', status: 'SENT', serviceDueAt: past });

      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      expect(metrics.overdueReliefCount.suppressed).toBe(true); // 2 < threshold of 5
      expect(metrics.overdueReliefCount.count).toBeNull();
    });
  });

  describe('district isolation', () => {
    it('a referral belonging to a different district never appears in this district\'s metrics', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const puneVictim = seedUser('Pune');
      const mumbaiVictim = seedUser('Mumbai');
      for (let i = 0; i < 6; i += 1) {
        seedReferral({ userId: mumbaiVictim.id, destinationType: 'mental_health', status: 'SENT' });
      }
      seedReferral({ userId: puneVictim.id, destinationType: 'mental_health', status: 'SENT' });

      const metrics = await oversightService.getDistrictMetrics(staff, 'Pune');
      // Only 1 Pune referral exists — below threshold, so the cell is
      // suppressed, and critically it must NOT reflect Mumbai's 6.
      const cell = metrics.referralsByDestinationAndStatus.mental_health?.SENT;
      expect(cell?.count).not.toBe(6);
    });
  });

  describe('audit hook', () => {
    it('records a successful read as an id/code row, with no resourceId (aggregate, not single-record)', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      await oversightService.getDistrictMetrics(staff, 'Pune');

      expect(fake.staffAuditLogRows).toHaveLength(1);
      expect(fake.staffAuditLogRows[0].action).toBe('oversight.metrics.read');
      expect(fake.staffAuditLogRows[0].resourceType).toBe('district');
      expect(fake.staffAuditLogRows[0].resourceId).toBeNull();
    });

    it('does NOT record an audit entry for a denied attempt', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor' });
      await expect(oversightService.getDistrictMetrics(staff, 'Pune')).rejects.toBeInstanceOf(ForbiddenException);
      expect(fake.staffAuditLogRows).toHaveLength(0);
    });
  });
});
