# S13 — Milestone Domain Foundation

Implementation record for S13. With S12's task domain landing the one
remaining referral-adjacent capability from Workflow H, re-auditing the
dependency graph again (per this master spec's section 33 discipline —
never assume a predefined sequence) found that v0.2 Workflow B "B5"
describes a second, genuinely independent, infrastructure-free
capability: case-manager-entered investigation milestones, explicitly
distinguished by the spec's own text from the automated court-sync poll
that remains blocked.

## A. S13 scope

**In scope:**
1. A Node milestone domain (`apps/core-api/src/milestone/`): a
   `milestones` table matching v0.2 §12's own column list exactly (`id,
   case_id, type, due_at, met_at, entered_by`), a closed, validated set
   of 3 milestone types, and creation/mark-met/list operations reusing
   S7-S12's exact authorization and concurrency patterns.
2. A real, evidenced type vocabulary: `fir_filed`, `chargesheet_filed`,
   `relief_instalment_paid` — the exact three events v0.2's own text
   names ("Investigation milestones that have no reliable public feed
   (chargesheet filed, relief instalment paid)... Entering the FIR
   date...").
3. Tests: type-validation unit tests, service unit tests (authorization,
   both real actions, concurrency, audit hook), and a real-Postgres,
   real-HTTP integration suite.

**Out of scope (explicitly deferred — a genuine split within v0.2's own
"B5" text, not an invented boundary):**
- **Automated milestone-timer computation** ("Entering the FIR date
  starts configurable milestone timers from a legal-reviewed template").
  This needs a legal-reviewed template — this repository has no
  legal-advisor sign-off for one, and this master spec's own instruction
  is explicit: never invent legal conclusions or requirements. Inventing
  a "configurable timer template" without that review would be exactly
  the kind of unevidenced, legally-consequential business rule this
  master spec prohibits.
- **Timer-expiry handling** (the `milestone_due` scheduling trigger, v0.2
  Workflow C's trigger table: "When a milestone timer expires unmet").
  Needs the job-queue infrastructure that still does not exist anywhere
  in this repository (S8 audit §F/I) — unchanged since S8, S9, and S10
  all deferred the same category of work for the same reason.
- **Any FastAPI change or client cutover** — no FastAPI milestone
  equivalent exists anywhere in the real schema (confirmed absent, same
  12-table enumeration `docs/S8_DEPENDENCY_AUDIT.md` section E already
  performed) — pure net-new capability, zero dual-writer risk.
- **Editing a milestone's type after creation, or un-marking a met
  milestone** — no evidence anywhere in v0.2's text supports either
  operation; a case manager who records the wrong type has no correction
  path in this slice (a real, acknowledged limitation, not silently
  worked around).

## B. Why `dueAt`/`metAt` accept a client-supplied date (a deliberate
exception to this repository's "server always determines the value"
default)

Every other domain's transition/state endpoint (lifecycle, referral,
task) accepts ONLY a target state from the client — never a
client-supplied timestamp or "current state" claim — because those
values are authorization- or integrity-relevant (a fabricated "current
state" could let a client skip validation; a fabricated timestamp could
misrepresent an SLA). A milestone's `dueAt`/`metAt` are categorically
different: they are the case manager reporting a REAL, KNOWN fact about
the physical world (a court date the case manager was told during a
phone call, an already-past date they're only now getting to record) —
the same "genuine staff-entered content, not a fabrication" reasoning
`docs/S9_REFERRAL_MIGRATION.md` already established for referral packet
fields like `legalIssueSummary`/`threatLog`. Both fields are optional; if
omitted, `markMet` defaults to `now()` (the common case), and `dueAt` is
simply left unset (there is no "the server invents a due date" fallback
anywhere in this slice).

## C. State model (deliberately simple)

A milestone has exactly two real states — unmet (`met_at IS NULL`) and
met (`met_at` set) — no diagram or matrix needed the way lifecycle/
referral/task warranted one. `markMet` is a concurrency-safe conditional
claim (`UPDATE ... WHERE id = ? AND met_at IS NULL`), the same atomic
pattern S5/S8/S9/S11/S12 all reuse, so two concurrent "mark met" requests
for the same milestone can never both succeed — proven by both a
simulated unit-level race and (implicitly, via the same, already-proven
code path) the real-Postgres row-locking guarantee S8's own integration
suite first established for this exact pattern.

## D. Tests

- **Unit** (`milestone-types.spec.ts` — 2 tests; `milestone.service.spec.ts`
  — 14 tests, `FakePrismaService`): closed-set type validation, both real
  operations (create with/without a supplied `dueAt`, markMet with/
  without a supplied `metAt`, rejecting an already-met remark), case-scope
  authorization (assignment- and district-scoped, oversight-tier
  exclusion), a simulated concurrency race, and audit-row presence/
  absence.
- **Integration** (`milestone.integration-spec.ts` — 10 tests, real
  disposable PostgreSQL, real HTTP via supertest): migration additivity,
  a full real-HTTP create → mark-met → list sequence, real staff-supplied
  `dueAt`/`metAt` round-tripping through actual HTTP JSON, invalid-type
  rejection (400) and double-mark-met rejection (409), unauthenticated/
  oversight-tier denial, cross-district and cross-assignment denial, and
  audit-row ordering. This suite skips 0007/0008/0010 (referral/task
  migrations) entirely, since it never touches those tables — but
  required adding 0009 (the audit hash-chain) after an initial run
  failed with a real Postgres error (`staff_audit_chain_head` missing),
  a concrete reminder that EVERY domain calling `StaffAuditService.
  record()` now depends on that table existing, not just the domains
  that existed when S11 was built.
- **Regression**: full S1-S12 unit suite (284 tests before this slice's
  own new tests) and integration suite (119 tests before) both re-run —
  no OTHER existing suite's migration list needed changing (`0011_
  milestones.sql` adds a wholly new table, touching neither `cases` nor
  any other existing table's columns). 298 unit tests and 129 integration
  tests total after this slice.

## E. Known limitations

- **No automated timer computation or expiry handling** — Section A;
  both are genuine, named blockers (legal review, job-queue
  infrastructure), not deferred by convenience.
- **No milestone correction/deletion path** — Section A.
- **No FastAPI equivalent to reconcile** — none exists.
