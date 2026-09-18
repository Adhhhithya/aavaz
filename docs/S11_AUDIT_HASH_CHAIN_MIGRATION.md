# S11 — Audit Hash-Chain Foundation

Implementation record for S11, the last of the three infrastructure-
independent candidates `docs/S8_DEPENDENCY_AUDIT.md` section L identified
(referral — S9 — and oversight — S10 — were the first two). Extends S7's
minimal `staff_audit_log` toward v0.2 §15's tamper-evident design: "each
row stores the hash of the previous row so tampering is detectable."

## A. S11 scope

**In scope:**
1. Hash chaining for every row `StaffAuditService.record()` writes:
   `prevHash`/`hash` columns (additive) on the existing `staff_audit_log`
   table, plus a new singleton `staff_audit_chain_head` table tracking the
   chain's current tip.
2. A concurrency-safe append: the same atomic conditional-`UPDATE` claim
   pattern already proven in S5/S8/S9, applied to the new singleton row.
3. A real chain-verification function (`verifyChain`) that detects
   content tampering, deleted rows (both mid-chain and at the tip), forks,
   and pre-migration (unchained) rows — proven against genuinely
   persisted, real-Postgres rows, including a raw-SQL tamper that bypasses
   the application layer entirely.
4. A `verifyChainIntegrity()` service method — a real, callable building
   block, not exposed over HTTP in this slice (see Section E).
5. Tests: pure hash/verification unit tests, service-level concurrency
   unit tests (simulated race), and a dedicated real-Postgres,
   real-HTTP integration suite proving the concurrency-safety claim
   against actual concurrent requests — not just a simulated one.

**Out of scope (explicitly deferred — genuine blockers, not
avoidable work):**
- **WORM export** (v0.2 §15: "daily export to write-once storage"). This
  needs an object-storage target (S3-compatible bucket, GCS, or
  equivalent) this repository has no credentials, bucket, or provider
  decision for. Per this master spec's own criteria (`external service
  account unavailable` is a legitimate stopping condition), this is
  correctly deferred rather than worked around with a fake local-disk
  stand-in that would misrepresent "write-once" durability it cannot
  actually provide.
- **Non-staff actors** — v0.2's audit_log conceptually covers system/
  worker actions too, not just staff reads; no system/worker actor
  identity concept exists anywhere in this repository yet (no workers
  exist at all, S8 audit §F).
- **Break-glass auditing** — v0.2 §15: "out-of-scope access needs a typed
  reason, expires in 2 hours, and notifies the supervisor." No
  authorization-override/break-glass code path exists anywhere in this
  repository to audit in the first place; building the audit trail for a
  feature that doesn't exist would be scope invented ahead of need.
- **Denial-attempt logging** — S7's original design records only
  successful reads (matching v0.2's own "every READ... is logged"
  phrasing literally); unchanged in this slice.
- **An HTTP endpoint for chain verification** — no v0.2 API-surface table
  names one; `verifyChainIntegrity()` exists as a tested, callable method
  for whenever a real compliance/break-glass slice needs it.
- **Reason field usage** — `staff_audit_log.reason` remains reserved,
  always NULL, per S7's own original design (unchanged by hash-chaining,
  which chains over the fields that already exist, not new ones).

## B. Why a separate chain-head table (a real design decision)

Every prior concurrency-safe write in this codebase (S5's counsellor-
caseload claim, S8's lifecycle transition, S9's referral transition) uses
an atomic conditional `UPDATE ... WHERE <column> = <value just read>`
against a row that already, naturally exists for the entity being
mutated. A hash chain has no such natural row — each new entry is a fresh
`INSERT`, not an update to something that already has an id to condition
on. Rather than invent a new concurrency strategy (e.g. `SELECT ... FOR
UPDATE`, not used anywhere else in this codebase), this slice introduces
one single-row table (`staff_audit_chain_head`, `id` always `1`, enforced
by a `CHECK` constraint) whose entire purpose is to BE that conditionable
row — reusing the established pattern rather than adding a second one.
See `backend/migrations/0009_audit_hash_chain.sql`'s header for the full
reasoning.

## C. Genesis hash

A fixed, deterministic constant — `sha256('AAVAZ_AUDIT_CHAIN_GENESIS')` —
computed in Node (matching `consent-copy.ts`'s own SHA-256-in-application-
code precedent) rather than in SQL via `pgcrypto`'s `digest()`, since
`pgcrypto` is not enabled anywhere in this repository and enabling it
would be a new infrastructure dependency this one constant doesn't
justify. NOT random — every fresh deployment's chain starts from the
identical, publicly-recomputable value
(`f60ab132aafb26848316d3e8ad3395d0dc40d7a93049d4d84a4145cc01e79171`),
asserted by its own dedicated test (`audit-chain.spec.ts`) so a future
accidental change to the constant string is caught immediately.

## D. Verification method: follow the pointers, not a timestamp column

`verifyChain` (`apps/core-api/src/staff/audit-chain.ts`) reconstructs
chain order by following `prevHash -> hash` pointers starting from the
genesis value, NOT by trusting `createdAt` or database row-return order —
the same principle any real tamper-evident log verification uses. A row's
true position is entirely determined by which other row's `hash` equals
its own `prevHash`. This correctly and distinctly detects: content
tampering (a row's stored `hash` no longer matches what its own content
recomputes to), a deleted mid-chain row (the following row becomes
orphaned — its `prevHash` no longer resolves to any row), a deleted
tip row (the reconstructed chain ends before reaching the stored
chain-head's `tipHash`), a fork (two rows claiming the same `prevHash` —
should be cryptographically near-impossible to occur legitimately, since
`prevHash` values are only ever advanced by a successful, serialized
chain-head claim), and a pre-hash-chaining row (`prevHash`/`hash` both
`NULL`) — reported as broken, never silently skipped as if it didn't
exist.

## E. A real concurrency bug found and fixed during this slice's own
testing (not theoretical)

The first implementation used a plain retry loop with **no delay between
attempts** and a bound of 10. `test/audit-chain.integration-spec.ts`'s own
20-genuinely-concurrent-HTTP-requests test caught this failing for real,
repeatably: under real Postgres contention, concurrent losers that all
re-read the chain head at the same instant a winner commits collide again
on their very next attempt (a "thundering herd" against one singleton
row) — a plain retry-with-no-delay loop needs up to `N-1` rounds in the
worst case for `N` truly simultaneous contenders, so 10 attempts is
insufficient for 20-way contention.

Fixed with jittered backoff between attempts (`jitterMs`, capped at 40ms,
randomized per attempt) plus raising the bound to 25 —
`staff-audit.service.ts`'s own comment records this as a finding from
this slice's real test run, not a defensively-guessed value. Kept
intentionally short (milliseconds, not seconds) because the delay happens
INSIDE the caller's open transaction/connection — a long delay would trade
one contention problem (lock contention) for another (connection-pool
exhaustion under sustained concurrent load). Re-verified stable across
multiple repeated runs of the same 20-concurrent-request test after the
fix, not just a single passing run.

This is exactly the kind of "a test found a real problem in this slice's
own code; fix it, don't weaken the test" outcome this master spec's
quality-gate discipline requires — recorded here rather than silently
folded into the implementation's history as if the first design had been
correct all along.

## F. What "audited" means in this slice

Only `StaffAuditService.record()`'s own callers are chained — every
domain that already calls it (S7's console reads, S8's lifecycle
transitions, S9's referral drafts/transitions/reads, S10's oversight
reads) is automatically covered with no change to those domains' own
code, since hash-chaining is entirely internal to `record()`'s
implementation. No caller needed to change how it invokes `record()`.

## G. Tests

- **Unit** (`audit-chain.spec.ts` — 14 tests; `staff-audit.service.spec.ts`
  — 7 tests, `FakePrismaService`): genesis-hash reproducibility, hash
  determinism and single-field sensitivity, a full valid-chain
  verification, and distinct detection of every tamper class (content
  modification, mid-chain deletion, tip deletion, fork, pre-chaining
  row) — plus a simulated concurrent-claim race (a losing attempt retries
  against the winner's new tip) and a genuine retry-exhaustion case
  (throws rather than silently dropping the entry).
- **Integration** (`audit-chain.integration-spec.ts` — 7 tests, real
  disposable PostgreSQL, real HTTP via supertest): migration additivity,
  genesis seeding, a sequential real-HTTP chain, **20 genuinely concurrent
  real HTTP requests producing exactly 20 audit rows forming one fully
  valid, unforked chain** (the property Section E's fix was required
  for), a mixed-domain concurrency test (console reads racing lifecycle
  transitions, proving the SAME chain-head claim correctly serializes
  writers from different domains, not just the same endpoint), and two
  tamper-detection tests against genuinely persisted rows — one via raw
  SQL bypassing the application layer entirely, one via row deletion.
- **Regression**: `lifecycle.integration-spec.ts`,
  `staff-console.integration-spec.ts`, `referral.integration-spec.ts`,
  and `oversight.integration-spec.ts` each had `0009_audit_hash_chain.sql`
  added to their throwaway-Postgres migration list — they all call
  `StaffAuditService.record()` through their own real endpoints, so their
  shared Prisma Client now expects the new `staff_audit_chain_head` table
  to exist, the same class of fix S8's and S10's own "Known limitations"
  sections already documented. `identity`/`registration`/`onboarding`
  integration specs do NOT call `record()` anywhere in their tested paths
  (verified by direct search before deciding not to touch them) and were
  correctly left unmodified. Full S1-S10 regression suite (253 unit
  tests, 107 integration tests after this slice) passes.

## H. Known limitations

- **No WORM export** — Section A; a genuine external-infrastructure
  blocker, not deferred out of convenience.
- **No non-staff actors, no break-glass auditing** — Section A; no code
  path exists yet in this repository for either concept.
- **No HTTP-exposed verification endpoint** — Section A; a real, tested
  method exists, just not wired to a route.
- **A hot lock under sustained high concurrency** — every audit write in
  the whole system serializes through one singleton row. Acceptable and
  tested up to 20-way genuine concurrency at this system's current scale;
  not claimed to be the final design for a much higher-throughput future
  (a sharded or batched chain-head design would be the natural next step
  if this ever becomes a real bottleneck — not built preemptively here).
- **Rows written before this migration have `prevHash`/`hash` = NULL** —
  correctly reported as broken by `verifyChain`, not silently excluded or
  backfilled with a fabricated value. A fresh deployment (no pre-S11
  history) has no such rows at all.
