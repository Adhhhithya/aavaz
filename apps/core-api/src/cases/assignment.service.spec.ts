import { FakePrismaService } from '../../test/fake-prisma';
import { AssignmentService } from './assignment.service';

/**
 * Exercises the REAL AssignmentService logic (district/language matching,
 * per-counsellor caseload-cap exclusion, race-safe claiming) against the
 * in-memory fake — the direct TypeScript equivalent of what a
 * characterization test for backend/api/assignment/auto_assign.py would
 * look like, per docs/AAVAZ_MIGRATION_PLAN.md §5's instruction to add
 * characterization tests before refactoring ported logic.
 */

let idSeq = 0;
function counsellor(
  fake: FakePrismaService,
  over: Partial<{ district: string; languages: string[]; currentCaseload: number; caseloadCap: number }>,
) {
  idSeq += 1;
  const row = {
    id: `c-${idSeq}`,
    name: `Counsellor ${idSeq}`,
    district: over.district ?? 'Test District',
    languages: over.languages ?? ['en'],
    currentCaseload: over.currentCaseload ?? 0,
    caseloadCap: over.caseloadCap ?? 80,
  };
  fake.counsellorRows.push(row);
  return row;
}

describe('AssignmentService', () => {
  let fake: FakePrismaService;
  let service: AssignmentService;

  beforeEach(() => {
    fake = new FakePrismaService();
    service = new AssignmentService();
  });

  it('prefers the lowest-caseload counsellor who supports the requested language', async () => {
    counsellor(fake, { languages: ['hi'], currentCaseload: 0 });
    const taMatch = counsellor(fake, { languages: ['ta'], currentCaseload: 3 });
    counsellor(fake, { languages: ['ta'], currentCaseload: 5 });

    const result = await service.assign(fake as never, 'Test District', 'ta');
    expect(result?.id).toBe(taMatch.id);
  });

  it('falls back to the district-wide lowest caseload when no counsellor supports the language', async () => {
    const lowest = counsellor(fake, { languages: ['hi'], currentCaseload: 1 });
    counsellor(fake, { languages: ['en'], currentCaseload: 4 });

    const result = await service.assign(fake as never, 'Test District', 'ta');
    expect(result?.id).toBe(lowest.id);
  });

  it("increments the chosen counsellor's caseload by exactly one", async () => {
    const c = counsellor(fake, { currentCaseload: 2 });
    await service.assign(fake as never, 'Test District', 'en');
    expect(fake.counsellorRows.find((r) => r.id === c.id)?.currentCaseload).toBe(3);
  });

  it('returns null when the district has no counsellors at all', async () => {
    const result = await service.assign(fake as never, 'Nowhere District', 'en');
    expect(result).toBeNull();
  });

  it("excludes a counsellor at or over THEIR OWN caseload cap — the deliberate v0.2 change from the existing algorithm", async () => {
    counsellor(fake, { currentCaseload: 80, caseloadCap: 80 }); // at their own cap, excluded
    const underCap = counsellor(fake, { currentCaseload: 79, caseloadCap: 80 });

    const result = await service.assign(fake as never, 'Test District', 'en');
    expect(result?.id).toBe(underCap.id);
  });

  it('returns null when every counsellor in the district is at or over their own cap (no silent overflow)', async () => {
    counsellor(fake, { currentCaseload: 80, caseloadCap: 80 });
    counsellor(fake, { currentCaseload: 95, caseloadCap: 80 });

    const result = await service.assign(fake as never, 'Test District', 'en');
    expect(result).toBeNull();
  });

  it('respects each counsellor\'s own, independently configured cap — a tight cap on one counsellor does not affect another with a looser cap', async () => {
    const tightlyCapped = counsellor(fake, { currentCaseload: 2, caseloadCap: 2 }); // at their tight cap, excluded
    const looselyCapped = counsellor(fake, { currentCaseload: 2, caseloadCap: 80 }); // same caseload, plenty of room

    const result = await service.assign(fake as never, 'Test District', 'en');
    expect(result?.id).toBe(looselyCapped.id);
    expect(result?.id).not.toBe(tightlyCapped.id);
  });

  it('a counsellor with no explicit cap uses the schema default of 80', async () => {
    // Mirrors real Postgres: caseload_cap is NOT NULL DEFAULT 80
    // (backend/migrations/0003_counsellor_caseload_cap.sql) — the fake
    // helper's own default matches that, not an arbitrary test choice.
    const c = counsellor(fake, { currentCaseload: 79 });
    expect(c.caseloadCap).toBe(80);
    const result = await service.assign(fake as never, 'Test District', 'en');
    expect(result?.id).toBe(c.id);
  });

  it('district match is exact (case-sensitive, no fuzzy matching) — same as the existing algorithm', async () => {
    counsellor(fake, { district: 'Test District' });
    const result = await service.assign(fake as never, 'test district', 'en');
    expect(result).toBeNull();
  });

  it('retries the next candidate when the first candidate loses the claim race', async () => {
    const first = counsellor(fake, { currentCaseload: 0, caseloadCap: 80 });
    const second = counsellor(fake, { currentCaseload: 1, caseloadCap: 80 });

    // Simulate a concurrent request winning the race for the first
    // (lowest-caseload) candidate between this service's SELECT and its
    // UPDATE, by pushing it over its own cap out-of-band before assign()
    // claims it.
    const originalFindMany = fake.counsellor.findMany.bind(fake.counsellor);
    fake.counsellor.findMany = (async (args: Parameters<typeof originalFindMany>[0]) => {
      const rows = await originalFindMany(args);
      const target = fake.counsellorRows.find((r) => r.id === first.id)!;
      target.currentCaseload = target.caseloadCap; // raced to the cap by "another request"
      return rows;
    }) as typeof fake.counsellor.findMany;

    const result = await service.assign(fake as never, 'Test District', 'en');
    expect(result?.id).toBe(second.id);
  });
});
