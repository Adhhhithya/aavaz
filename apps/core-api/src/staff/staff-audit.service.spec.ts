import { InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { AUDIT_CHAIN_GENESIS_HASH } from './audit-chain';
import { StaffAuditService } from './staff-audit.service';

describe('StaffAuditService', () => {
  let fake: FakePrismaService;
  let auditService: StaffAuditService;

  beforeEach(() => {
    fake = new FakePrismaService();
    auditService = new StaffAuditService(fake as unknown as PrismaService);
  });

  describe('hash chaining', () => {
    it('a fresh instance starts at the real genesis hash', async () => {
      const result = await auditService.verifyChainIntegrity();
      expect(result).toEqual({ valid: true, rowsVerified: 0, totalRows: 0 });
    });

    it('the first recorded row chains from genesis, and the chain head advances to match', async () => {
      await auditService.record('staff-1', 'console.queue.read', 'queue');

      expect(fake.staffAuditLogRows).toHaveLength(1);
      const row = fake.staffAuditLogRows[0];
      expect(row.prevHash).toBe(AUDIT_CHAIN_GENESIS_HASH);
      expect(row.hash).not.toBeNull();
      expect(fake.staffAuditChainHeadRow.tipHash).toBe(row.hash);
    });

    it('each subsequent row chains from the previous row\'s hash, not genesis again', async () => {
      await auditService.record('staff-1', 'console.queue.read', 'queue');
      await auditService.record('staff-2', 'console.victim.read', 'victim', 'victim-1');

      const [first, second] = fake.staffAuditLogRows;
      expect(second.prevHash).toBe(first.hash);
      expect(second.prevHash).not.toBe(AUDIT_CHAIN_GENESIS_HASH);
    });

    it('a sequence of records produces a chain that verifies as fully valid', async () => {
      await auditService.record('staff-1', 'console.queue.read', 'queue');
      await auditService.record('staff-2', 'console.victim.read', 'victim', 'victim-1');
      await auditService.record('staff-3', 'lifecycle.case.transition', 'case', 'case-1');

      const result = await auditService.verifyChainIntegrity();
      expect(result.valid).toBe(true);
      expect(result.rowsVerified).toBe(3);
      expect(result.totalRows).toBe(3);
    });

    it('directly tampering with a stored row (e.g. a manual DB edit) is caught by verification', async () => {
      await auditService.record('staff-1', 'console.queue.read', 'queue');
      fake.staffAuditLogRows[0].action = 'lifecycle.case.transition'; // simulated tamper

      const result = await auditService.verifyChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/stored hash does not match recomputed hash/);
    });
  });

  describe('concurrency safety (claim-and-retry)', () => {
    it('a losing claim attempt retries against the winner\'s new tip and still produces a valid chain', async () => {
      // Simulate a concurrent writer: the FIRST call to updateMany from
      // this test's own record() call is made to fail once (as if another
      // request's transaction committed first and advanced the tip
      // between this request's read and its own claim attempt), then
      // succeeds on retry against the now-current tip.
      const originalUpdateMany = fake.staffAuditChainHead.updateMany.bind(fake.staffAuditChainHead);
      let interceptCount = 0;
      fake.staffAuditChainHead.updateMany = (async (args: Parameters<typeof originalUpdateMany>[0]) => {
        interceptCount += 1;
        if (interceptCount === 1) {
          // A "concurrent" writer wins first: advance the real tip out from
          // under this request, exactly as a genuinely concurrent
          // transaction committing first would.
          fake.staffAuditChainHeadRow.tipHash = 'a-hash-from-a-concurrent-winner';
          return { count: 0 };
        }
        return originalUpdateMany(args);
      }) as typeof fake.staffAuditChainHead.updateMany;

      await auditService.record('staff-1', 'console.queue.read', 'queue');

      expect(interceptCount).toBeGreaterThanOrEqual(2); // at least one retry happened
      expect(fake.staffAuditLogRows).toHaveLength(1);
      // The retried row must chain from the CONCURRENT WINNER's tip, not
      // the stale value this request originally read.
      expect(fake.staffAuditLogRows[0].prevHash).toBe('a-hash-from-a-concurrent-winner');
    });

    it('exhausting all retry attempts throws rather than silently dropping the audit entry', async () => {
      fake.staffAuditChainHead.updateMany = (async () => ({ count: 0 })) as typeof fake.staffAuditChainHead.updateMany;

      await expect(auditService.record('staff-1', 'console.queue.read', 'queue')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(fake.staffAuditLogRows).toHaveLength(0);
    });
  });
});
