# S10 — Oversight Domain Foundation

Implementation record for S10, the second of the two remaining
infrastructure-independent candidates `docs/S8_DEPENDENCY_AUDIT.md`
section L identified (referral — S9 — was the first). Chosen over audit
hash-chaining because it closes a real, currently-live problem the S8
audit's own Section D/P flagged: FastAPI's `backend/api/dashboards/
state_routes.py` returns 100%-hardcoded mock data with no indication to a
caller that it isn't live — a genuine misrepresentation risk, not a
hypothetical one.

## A. S10 scope

**In scope:**
1. A Node oversight domain (`apps/core-api/src/oversight/`) implementing
   v0.2 §14's exact `GET /v1/oversight/districts/{code}/metrics` path.
2. The three metrics v0.2 Workflow H "H4" names: referrals by destination
   and status, median days to service, overdue relief count — each with
   real small-count suppression (any cell below 5, per H4's own "any cell
   below 5 is suppressed").
3. A new `OVERSIGHT_ROLES` set (`state_admin`, `national_admin`) —
   disjoint from S7's `CONSOLE_INDIVIDUAL_RECORD_ROLES` by construction,
   matching v0.2's own two-tier access model (§15's role table).
4. A considered, documented district-scoping asymmetry for this tier (see
   Section D).
5. An audit hook extending `StaffAuditService` with
   `oversight.metrics.read`/`district`.
6. A small, additive follow-up to S9: `Referral.inServiceAt`
   (`backend/migrations/0008_referral_in_service_at.sql`) — discovered as
   a genuine gap while implementing "median time to service," not
   anticipated in S9's original design (see Section B).
7. Tests: suppression-utility unit tests, service unit tests (role
   gating, the district-scoping asymmetry, suppression behavior, district
   isolation, audit hook), and a real-HTTP, real-PostgreSQL integration
   suite covering the same properties including real cross-district
   isolation.

**Out of scope (explicitly deferred):**
- Any FastAPI change — `state_routes.py`/`district_routes.py`/
  `national_routes.py` remain live, unmodified. This slice does not
  migrate any client to the new endpoint; it is the first real,
  evidence-based Node implementation of the same capability, proven in
  isolation, matching every prior slice's posture (S4-S9).
- A nightly batch job — v0.2 frames H4 as "a nightly job builds anonymised
  district metrics." No job queue exists (S8 audit §F/I), so this slice
  computes the same aggregates synchronously, on-demand, per request. A
  documented, deliberate divergence — not a silent one.
- National/state-level (as opposed to per-district) aggregate views — v0.2
  §14 only names a per-district endpoint; a rolled-up multi-district view
  is a plausible future need but not specified anywhere found in the PDF.
- Any frontend/mobile change.
- Any metric beyond the three H4 names — no dashboard-shaped "everything a
  state admin might want to see" was invented.

## B. The `inServiceAt` gap (why S9 needed a follow-up)

S9's original `Referral` model captured `sentAt`, `ackedAt`,
`serviceDueAt`, `deliveredAt`, `verifiedAt` — every SLA-relevant timestamp
v0.2's Workflow G text explicitly named. It did not anticipate that
Workflow H's "median time to service" metric needs to know **when
service actually started**, not merely that a deadline (`serviceDueAt`)
existed or was met. `serviceDueAt` is a fixed offset from `sentAt` (always
exactly `sentAt + 10 working days`, per S9's own SLA computation) — using
it as a stand-in for "time to service" would report a constant, not a
real measurement, silently misrepresenting the metric.

Rather than approximate, `backend/migrations/0008_referral_in_service_at.sql`
adds one nullable column, and
`apps/core-api/src/referral/referral.service.ts`'s `transition` method was
extended (in the same commit as this slice, not S9's) to stamp it when a
referral reaches `IN_SERVICE`. This is exactly the kind of "an existing
migrated domain needed a small, additive follow-up because a later slice
revealed a real gap" case `docs/AAVAZ_MIGRATION_PLAN.md`'s own incremental-
migration discipline anticipates — documented here rather than silently
folded into S9's history.

**Consequence for existing tests**: since this is a new column on the
S9-created `referrals` table (not a new table), every test suite that
writes a `Referral` row needs
`0008_referral_in_service_at.sql` in its throwaway-Postgres migration
list — the same lesson S8's own "Known limitations" section documented
for `0006_lifecycle.sql`. `test/referral.integration-spec.ts`'s list was
updated accordingly; `test/oversight.integration-spec.ts` includes it from
the start. No other existing suite creates `Referral` rows, so no other
suite needed updating (confirmed by running the full existing suite
unmodified before making this exact fix, and again after).

## C. Metric definitions (and the ambiguities resolved)

**"Referrals by destination and state"**: read as "referral lifecycle
status" (`Referral.status`, the 12-state machine from S9), not "Indian
geographic state" — the endpoint is already district-scoped
(`/districts/{code}/metrics`), so a geographic-state breakdown inside a
single district's response would not be a meaningful grouping. This
reading is also supported by the event catalog's own naming convention
(`referral.state_changed` — "state" already means "lifecycle status"
everywhere else in this spec). A grid: `{ [destinationType]: { [status]:
SuppressibleCount } }`, each cell independently suppressed.

**"Median time to service"**: `median(inServiceAt - sentAt)` in days, over
referrals in the district where BOTH are set. A referral that never
reached `IN_SERVICE` is excluded from the sample entirely — not counted
as zero (which would understate the real median) and not silently
omitted without documentation (it is the expected, correct behavior,
proven by test). The sample size itself is suppressed alongside the
median when below threshold — see Section E.

**"Overdue relief count"**: welfare-destination referrals whose
`serviceDueAt` has passed and whose status is not one of `VERIFIED`,
`DELIVERED` (service genuinely started/completed), `DISCARDED`, or
`CLOSED_UNRESOLVED` (already resolved, however unsuccessfully). "Relief"
is read as specifically the `welfare` destination type, matching v0.2's
own destination-table wording ("Welfare (district social welfare): ...
relief stage pending...") — not a broader "any referral" count. A
referral past its due date but already in a terminal state is not
"overdue" in any actionable sense; only a still-pending one is.

## D. District-scoping asymmetry (a considered decision, not an
inconsistency)

S7/S8/S9's `CONSOLE_INDIVIDUAL_RECORD_ROLES` convention (`counsellor`/
`supervisor`/`district_admin`) treats an EMPTY `districtScope` as
authorizing nothing — fail-closed, because individual victim PII access
is sensitive by default and the safe default is "see nothing until
explicitly scoped."

`OVERSIGHT_ROLES` (`state_admin`/`national_admin`) inverts this: an empty
`districtScope` means **no restriction** (any district may be queried),
and a non-empty one narrows it. This is deliberate, not an oversight:

- v0.2's own role classification (§9, restated in this master spec's own
  §9) describes `state_admin`/`national_admin` as having "oversight-tier
  access, not arbitrary individual victim access" — the qualifier is on
  the KIND of access (aggregate vs. individual), not a district boundary.
  National oversight, by definition, needs cross-district visibility to
  function at all; a fail-closed empty scope would make the role
  structurally unable to do its one job.
- The data this tier can see is already the least sensitive tier in the
  system (small-count-suppressed aggregates, explicitly "cannot see any
  individual record" per §15's role table) — the risk profile of "wrong
  district" here is categorically smaller than for `CONSOLE_INDIVIDUAL_
  RECORD_ROLES`, where an empty-scope default of "see everything" would
  expose real victim records.
- `Staff.districtScope` remains available (not removed or ignored) for an
  operator who DOES want to narrow a specific `state_admin` appointment to
  a named set of districts — the field's meaning is "an explicit narrowing
  constraint when present," not "the only source of truth for scope,"
  for this one tier.

Proven by test at both the unit and real-HTTP/real-Postgres level (an
empty-scope oversight-tier staff member can query an arbitrary,
never-before-seen district string; a scoped one is rejected outside their
list).

## E. Suppression design

`apps/core-api/src/oversight/oversight-suppression.ts`'s `suppressibleCount`
and `suppressibleMedian` share one behavior: when a cell/sample is below
`SUPPRESSION_THRESHOLD` (5, matching H4's own wording), BOTH the
statistic AND the underlying sample size are hidden — not just the
statistic. Revealing "a below-5 exact count of referrals in this
destination/status pair" or "an exact below-5 sample size feeding a
suppressed median" can itself be as identifying in a small district as
the value it's meant to protect (e.g., "exactly 3 protection referrals in
this district this period" is itself sensitive information about that
district's caseload, independent of what any individual referral's
content is). This is a stricter reading than the PDF's literal "any cell
below 5 is suppressed" sentence taken as narrowly as possible — a
deliberate, documented choice toward the privacy-conservative side per
this master spec's "security > convenience" operating principle, not an
unevidenced invention (suppressing the count is explicitly required; this
extends the same principle to the sample-size number that would otherwise
leak alongside a suppressed median).

## F. Authorization, audit, and computation strategy

Authorization reuses S7/S8/S9's exact role-gate pattern
(`OversightService.getDistrictMetrics`), just against the new,
disjoint `OVERSIGHT_ROLES` set instead of `CONSOLE_INDIVIDUAL_RECORD_
ROLES`. The audit hook (`oversight.metrics.read`/`district`) omits
`resourceId` — a district code (`"Pune"`) is not a UUID and
`staff_audit_log.resource_id` is UUID-typed; this mirrors
`ConsoleService.getQueue`'s own existing precedent for an aggregate
(not single-row) read.

Aggregation is computed in Node, in memory, over rows fetched via one
`prisma.referral.findMany` call per request — not a raw SQL `GROUP BY`.
Chosen because this slice's actual data volume does not require
database-side aggregation yet, and computing in TypeScript avoids
introducing a raw-SQL code path (which would need its own
injection-safety review) for a first version. Revisit if/when data volume
makes in-memory aggregation a real performance concern — not claimed to
be optimal at scale, only correct and safe today.

## G. FastAPI coexistence

None required for correctness — this is a new Node endpoint, not a
migrated one. `state_routes.py`'s mock-data problem (S8 audit §D) is
**not fixed** by this slice; it remains live, unmodified, reachable, and
still returns fabricated numbers with no "this is not live data"
indicator. This slice provides a real alternative implementation but
performs no client cutover — restated here so it is not mistaken for
having closed that specific FastAPI-side risk.

## H. Tests

- **Unit** (`oversight-suppression.spec.ts` — 9 tests;
  `oversight.service.spec.ts` — 15 tests, `FakePrismaService`): threshold
  behavior for both count and median suppression (including the
  sample-size-is-also-hidden property), role gating for both directions
  (individual-record tier excluded, oversight tier admitted), the
  district-scoping asymmetry (empty = unrestricted, non-empty = narrowing),
  metric-definition correctness (exclusion of never-serviced referrals
  from the median, exclusion of resolved/wrong-destination referrals from
  the overdue count), district isolation, audit-row presence/absence.
- **Integration** (`oversight.integration-spec.ts` — 8 tests, real
  disposable PostgreSQL, real HTTP via supertest, referrals seeded through
  S9's own real HTTP draft endpoint rather than direct Prisma writes):
  role gating, the district-scoping asymmetry, small-count suppression
  crossing the real threshold via real HTTP requests, real
  cross-district isolation, audit-hook presence.
- **Regression**: the full existing S4-S9 unit suite (211 tests) and
  integration suite (92 tests across 6 suites) both re-run — one suite
  (`referral.integration-spec.ts`) required its migration list updated to
  include `0008_referral_in_service_at.sql` (Section B); after that fix,
  all pass unmodified. 235 unit tests and 100 integration tests total
  after this slice.

## I. Known limitations

- **No nightly batch job / caching** — every request recomputes the
  aggregates live (Section A, F).
- **`state_routes.py`'s fabricated-data problem is not fixed** — Section G.
- **No cross-district rollup view** — only the single-district endpoint
  v0.2 §14 names.
- **In-memory aggregation, not database-side** — Section F; a scale
  concern for a future slice, not a correctness concern today.
