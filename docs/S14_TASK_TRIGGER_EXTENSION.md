# S14 — `unassigned_case` Task Trigger

Implementation record for S14, a small, well-scoped follow-up
`docs/S12_TASK_MIGRATION.md` section A explicitly flagged as "real,
ready-to-wire, deliberately not done in S12" — wiring v0.2 Workflow A
"A7"'s `unassigned_case` task trigger into S5's `RegistrationService`.
Chosen next after re-auditing the dependency graph (per this master
spec's section 33 discipline) and confirming a separately-flagged item —
`docs/AAVAZ_MIGRATION_PLAN.md`'s Decision 5 (removing a fabricated CNR
from the FastAPI eCourts parser) — was already done and verified in an
earlier session (`backend/tests/test_ecourts_fabrication_removed.py`,
6/6 passing), leaving `unassigned_case` as the clearest remaining
low-risk, high-evidence unit of work.

## A. Scope

**In scope:**
1. A new task type, `unassigned_case`, added to `TASK_TYPES`.
2. `TaskService.createUnassignedCaseTaskTx` — creates the task inside the
   caller's own transaction, mirroring `createStalledReferralTaskTx`'s
   (S12) system-actor shape exactly (`createdByStaffId: null`, no
   separate audit row for the same reason S12 documented).
3. `RegistrationService` (S5) now calls it, in the SAME transaction as
   registration itself, precisely when v0.2's own text condition is met:
   "No match" — a district WAS resolved, but `AssignmentService.assign()`
   found no eligible counsellor. A case with no district at all is
   explicitly excluded (see Section B).
4. Tests: unit tests for both the true "no match" case and the two cases
   that must NOT create a task (successful assignment; no district at
   all), plus full regression coverage of every existing S5 registration
   test.

**Out of scope:** everything S12 already deferred (`court_sync_stale`,
`silence`) remains deferred for the same infrastructure reasons.

## B. Why a districtless case is excluded (a precise reading of "no
match", not an arbitrary narrowing)

A7's text: "No match creates an unassigned task for the district
supervisor." `TaskService.listTasks`'s district-scoped visibility
(`supervisor`/`district_admin`) filters on the CASE's own
`user.locationDistrict` — a task attached to a case with `locationDistrict
= null` could never appear in ANY district supervisor's queue, by
construction. Creating one anyway would produce a permanently-orphaned,
invisible row — not a real notification to anyone, and not what "creates
an unassigned task FOR THE DISTRICT SUPERVISOR" describes (there is no
"the district supervisor" to speak of when there is no district).
`RegistrationService`'s own existing code already distinguishes these two
"unassigned" cases in its log message (`'(unassigned — no eligible
counsellor)'` is only logged when a counsellor lookup was actually
attempted) — S14's `if (location.district && !counsellor)` guard reuses
that exact, pre-existing distinction rather than inventing a new one.

## C. Priority — a considered default, explicitly not spec-evidenced

A7 names no priority for this task type (unlike `referral_stalled`, whose
`serious` priority Workflow H's own escalation-ladder text supports).
`priority: 'bad'` was chosen and documented as this slice's own
considered judgment — a newly-registered victim with literally no
assigned support is a materially worse gap than v0.2's own `okay`
priority's routine connotation elsewhere (Workflow F's table pairs `Okay`
with "Next periodic check-in," a non-urgent cadence). Stated plainly as a
default, not fabricated as something the spec itself assigns.

## D. A real regression found and fixed by this slice's own test suite

Wiring `tasks.case_id` (a real foreign key, from S12) into a code path
every real HTTP registration can now reach surfaced two existing
integration suites whose `afterEach` cleanup deleted `cases` before
`tasks` — `registration.integration-spec.ts` (which deliberately creates
unassigned cases in several of its own tests) and
`staff-console.integration-spec.ts` (whose `registerVictim` helper
resolves every registration to the location mock's "Mock District," which
never has a seeded counsellor, so EVERY real registration in that suite
now creates an `unassigned_case` task). Both `afterEach` blocks were
reordered to delete `tasks` first — a real fix this slice's own full
regression run caught, not a hypothetical one. Neither
`identity.integration-spec.ts`, `onboarding.integration-spec.ts`, nor
`lifecycle.integration-spec.ts` needed the same fix: none of them pass a
`location` field to the real register endpoint (`lifecycle`'s own
`registerVictim` sets district via a raw `prisma.user.update` AFTER
registration completes, bypassing this trigger entirely) — confirmed by
direct search before deciding not to touch them, not assumed.

`registration.integration-spec.ts` and `staff-console.integration-spec.ts`
also both needed `0007_referrals.sql`/`0008_referral_in_service_at.sql`
added to their migration lists (even though neither suite touches a
referral directly) — `tasks.referral_id` has a real foreign key to
`referrals`, so that table must exist for the `tasks` table's own FK
constraint to be creatable at all.

## E. Tests

- **Unit** (3 new tests in `registration.service.spec.ts`; 1 updated
  assertion in `task-states.spec.ts` for the now-3-type set): the genuine
  "no match" case creates a real task with the correct type/priority/
  system-actor shape; a successful assignment creates no task; a
  districtless registration creates no task even with zero counsellors
  anywhere.
- **Regression**: full S1-S13 unit suite (298 tests before this slice's
  own 3 new tests) and integration suite (129 tests, unchanged count —
  no new integration test FILE was added this slice, only migration-list
  and cleanup-order fixes to two existing ones) both re-run. 301 unit
  tests and 129 integration tests total after this slice.

## F. Known limitations

Unchanged from S12 — `court_sync_stale` and `silence` remain unwired,
blocked on infrastructure this repository still doesn't have.
