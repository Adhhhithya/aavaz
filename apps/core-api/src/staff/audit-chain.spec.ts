import { AUDIT_CHAIN_GENESIS_HASH, AuditChainRow, computeAuditHash, verifyChain } from './audit-chain';

describe('audit-chain', () => {
  it('the genesis hash is the real, documented, reproducible SHA-256 of a fixed constant', () => {
    // Recomputed independently here (not imported from the constant
    // itself) so this test would fail if the constant's definition ever
    // silently changed — matching backend/migrations/0009_audit_hash_chain.sql's
    // own "recomputable independently" claim.
    const crypto = require('crypto');
    const expected = crypto.createHash('sha256').update('AAVAZ_AUDIT_CHAIN_GENESIS').digest('hex');
    expect(AUDIT_CHAIN_GENESIS_HASH).toBe(expected);
    expect(AUDIT_CHAIN_GENESIS_HASH).toBe('f60ab132aafb26848316d3e8ad3395d0dc40d7a93049d4d84a4145cc01e79171');
  });

  describe('computeAuditHash', () => {
    it('is deterministic — the same input always produces the same hash', () => {
      const input = {
        prevHash: AUDIT_CHAIN_GENESIS_HASH,
        staffId: 'staff-1',
        action: 'console.queue.read',
        resourceType: 'queue',
        resourceId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      expect(computeAuditHash(input)).toBe(computeAuditHash({ ...input }));
    });

    it('changing any single field changes the hash', () => {
      const base = {
        prevHash: AUDIT_CHAIN_GENESIS_HASH,
        staffId: 'staff-1',
        action: 'console.queue.read',
        resourceType: 'queue',
        resourceId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      const baseline = computeAuditHash(base);
      expect(computeAuditHash({ ...base, staffId: 'staff-2' })).not.toBe(baseline);
      expect(computeAuditHash({ ...base, action: 'console.victim.read' })).not.toBe(baseline);
      expect(computeAuditHash({ ...base, resourceType: 'victim' })).not.toBe(baseline);
      expect(computeAuditHash({ ...base, resourceId: 'victim-1' })).not.toBe(baseline);
      expect(computeAuditHash({ ...base, createdAt: new Date('2026-01-01T00:00:00.001Z') })).not.toBe(baseline);
      expect(computeAuditHash({ ...base, prevHash: 'a-different-prev-hash' })).not.toBe(baseline);
    });
  });

  function chainOf(count: number): AuditChainRow[] {
    const rows: AuditChainRow[] = [];
    let prevHash = AUDIT_CHAIN_GENESIS_HASH;
    for (let i = 0; i < count; i += 1) {
      const createdAt = new Date(2026, 0, 1, 0, 0, i);
      const hash = computeAuditHash({
        prevHash,
        staffId: `staff-${i}`,
        action: 'console.queue.read',
        resourceType: 'queue',
        resourceId: null,
        createdAt,
      });
      rows.push({
        id: `row-${i}`,
        staffId: `staff-${i}`,
        action: 'console.queue.read',
        resourceType: 'queue',
        resourceId: null,
        createdAt,
        prevHash,
        hash,
      });
      prevHash = hash;
    }
    return rows;
  }

  describe('verifyChain', () => {
    it('an empty chain against the genesis tip is valid', () => {
      const result = verifyChain([], AUDIT_CHAIN_GENESIS_HASH);
      expect(result).toEqual({ valid: true, rowsVerified: 0, totalRows: 0 });
    });

    it('a real, untampered chain of several rows verifies as valid', () => {
      const rows = chainOf(5);
      const result = verifyChain(rows, rows[rows.length - 1].hash!);
      expect(result.valid).toBe(true);
      expect(result.rowsVerified).toBe(5);
    });

    it('detects a modified field (content tampering) in a middle row', () => {
      const rows = chainOf(5);
      rows[2] = { ...rows[2], action: 'lifecycle.case.transition' }; // hash no longer matches this content
      const result = verifyChain(rows, rows[rows.length - 1].hash!);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/stored hash does not match recomputed hash/);
      expect(result.brokenRowId).toBe('row-2');
    });

    it('detects a deleted row from the middle (breaks the pointer chain — the following row becomes orphaned)', () => {
      const rows = chainOf(5);
      rows.splice(2, 1); // remove row-2
      const result = verifyChain(rows, rows[rows.length - 1].hash!);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/orphaned row/);
    });

    it('detects a deleted row from the end (chain no longer reaches the stored tip)', () => {
      const rows = chainOf(5);
      const realTip = rows[rows.length - 1].hash!;
      rows.pop(); // delete the last row, but the chain head still claims the old tip
      const result = verifyChain(rows, realTip);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/does not match the stored chain-head tip/);
    });

    it('detects a fork (two rows claiming the same prevHash)', () => {
      const rows = chainOf(3);
      const forged = { ...rows[2], id: 'row-forged', staffId: 'attacker' };
      const result = verifyChain([...rows, forged], rows[2].hash!);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/fork detected/);
    });

    it('reports a pre-hash-chaining row (null prevHash/hash) as broken, not silently skipped', () => {
      const rows = chainOf(2);
      rows.push({
        id: 'legacy-row',
        staffId: 'staff-x',
        action: 'console.queue.read',
        resourceType: 'queue',
        resourceId: null,
        createdAt: new Date(),
        prevHash: null,
        hash: null,
      });
      const result = verifyChain(rows, rows[1].hash!);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/predates hash-chaining/);
      expect(result.brokenRowId).toBe('legacy-row');
    });

    it('resourceId participates in the hash — swapping which resource a row references is detected', () => {
      const rows = chainOf(3);
      rows[1] = { ...rows[1], resourceId: 'a-different-resource-id' };
      const result = verifyChain(rows, rows[rows.length - 1].hash!);
      expect(result.valid).toBe(false);
    });
  });
});
