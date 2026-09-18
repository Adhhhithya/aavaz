# S8 — Case/Victim Lifecycle Foundation

Implementation record for S8, the slice approved after
`docs/S8_DEPENDENCY_AUDIT.md`'s read-only dependency audit. Locked boundary:
**case/victim lifecycle foundation** — a validated Node lifecycle domain,
reusing S7's staff authorization foundation, with a minimal opt-out marker
and an audit hook. No scheduling, no FastAPI changes, no full audit
hash-chain, no purge workflow.

## A. S8 scope

**In scope:**
1. A Node lifecycle domain (`apps/core-api/src/lifecycle/`).
2. Validated case-stage values based on v0.2's 11 lifecycle states.
3. Explicit transition validation via a defined transition matrix — not
   mere enum-membership checking.
4. Authenticated staff authorization, reusing S7's `StaffAuthGuard` /
   `@CurrentStaff()` / `ResolvedStaff` foundation.
5. District-scope and assignment authorization, reusing S7's proven
   application-layer model (no Postgres RLS).
6. Concurrency-safe lifecycle transition via transactional/conditional
   update semantics, proven both at the unit level and against real,
   disposable PostgreSQL.
7. A minimal victim-level opt-out foundation — state only, not the full
   cancellation/purge workflow.
8. An audit hook, reusing S7's minimal `StaffAuditService` foundation.
9. An additive-only migration (`backend/migrations/0006_lifecycle.sql`).
10. Tests: valid/invalid transitions, unauthorized staff, cross-district
    denial, cross-assignment denial, unrelated-ID denial, concurrent
    transitions (real Postgres), opt-out behavior, migration correctness,
    audit hook, full regression against S1–S7.

**Out of scope (explicitly deferred):** FastAPI lifecycle migration or any
FastAPI change, frontend changes, mobile changes, scheduling, Redis,
BullMQ, Temporal, triage-router, assessment pipeline, task/SLA engine,
referrals, court-sync, channel-gateway, conversation agent/memory, the full
v0.2 audit hash-chain/WORM system, break-glass, the purge workflow,
automated opt-out scheduling-cancellation, any S9+ functionality, and
FastAPI removal.

## B. Locked architecture decision

**Node does NOT become the globally authoritative lifecycle writer in this
slice.** The existing FastAPI lifecycle endpoint
(`backend/api/cases/lifecycle_routes.py::update_case_stage`) remains live
and untouched for coexistence.

The accurate statement is: **Node becomes the authoritative owner of
lifecycle transitions made through the new Node lifecycle domain path. The
legacy FastAPI lifecycle writer remains a known coexistence/cutover gap.**
The system does not have one lifecycle writer as of this slice — it has
two, writing to two different columns (`cases.lifecycle_state`, owned by
Node; `cases.case_stage`, still owned by FastAPI, unvalidated). See
sections I and J.

## C. Lifecycle state model

`Case.lifecycleState` (new column, `apps/core-api/src/lifecycle/lifecycle-states.ts`)
holds one of v0.2's 11 states:

```
PENDING_CONSENT, REGISTERED, VERIFIED, MONITORING, ESCALATED, REFERRED,
PAUSED, CLOSING, CLOSED, OPTED_OUT, PURGED
```

`LIFECYCLE_STATES` is the source of truth (a `const` array); `isLifecycleState()`
validates untrusted strings against it. Stored as free `TEXT`, not a
Postgres enum — the same choice already made for `otp_codes.purpose`,
`consents.scope`, and `staff.role`, to avoid an `ALTER TYPE` on a shared
column type. Application-layer validation is the actual enforcement point.

## D. Transition matrix

Reconstructed from v0.2's lifecycle diagram (a flowchart image on PDF pages
3–4) by re-extracting the PDF text in positional mode (`page.get_text('blocks')`,
which preserves each label's X/Y bounding box — default reading-order
extraction loses diagram topology entirely) and inferring edges from label
proximity to node boxes. Every included edge is traceable to a specific
extracted label position; every plausible-but-unevidenced edge is called
out explicitly rather than silently assumed, per this milestone's explicit
"do not invent a business rule" instruction. Full coordinate-level trace
lives in `lifecycle-states.ts`'s header comment.

```
PENDING_CONSENT → REGISTERED
REGISTERED      → VERIFIED, MONITORING
VERIFIED        → MONITORING
MONITORING      → ESCALATED, PAUSED, CLOSING, OPTED_OUT
ESCALATED       → REFERRED, CLOSING, OPTED_OUT
REFERRED        → MONITORING, CLOSING, OPTED_OUT
PAUSED          → MONITORING, CLOSING, OPTED_OUT
CLOSING         → CLOSED
CLOSED          → PURGED
OPTED_OUT       → PURGED
PURGED          → (terminal — no outgoing transitions)
```

Self-transitions (`from === to`) are rejected for every state as an
application-level safety default, not a v0.2 requirement.

**Deliberately not included, and why:**
- No pre-`MONITORING` opt-out or pause edge (`PENDING_CONSENT`/`REGISTERED`/
  `VERIFIED` → `OPTED_OUT` or `PAUSED`) — no edge label positions support
  this in the extracted diagram. FastAPI's legacy, unvalidated endpoint
  remains the only escape hatch for this specific case until explicitly
  decided.
- No `ESCALATED`/`REFERRED` → `PAUSED` directly — only `MONITORING → PAUSED`
  has clear positional support.
- No transition out of `CLOSED` or `PURGED` beyond the one evidenced edge
  each (`CLOSED → PURGED`, and none out of `PURGED`) — no outgoing edges
  are drawn from either in the extracted diagram.
- No transition out of `OPTED_OUT` other than `→ PURGED` — none shown.

## E. Authorization model

Identical shape to S7's `ConsoleService`, reused rather than reinvented:

1. Role gate: only `CONSOLE_INDIVIDUAL_RECORD_ROLES` may call the endpoint
   at all (`state_admin`/`national_admin` are rejected outright, per v0.2's
   oversight-tier-sees-aggregates-only rule).
2. `ASSIGNMENT_SCOPED_ROLES` (`counsellor`): access requires
   `staff.counsellorId` to be set (fail-closed if `null`) AND to equal the
   case's `assignedCounsellorId`. Never compares `staff.userId` to any
   counsellor identifier — the Decision-1 bridge from S7 is reused exactly.
3. All other in-role staff (`supervisor`, `district_admin`): access
   requires the case's victim's `locationDistrict` to be in
   `staff.districtScope`. An empty `districtScope` authorizes nothing.
4. A nonexistent case and an out-of-scope case produce the byte-identical
   `ForbiddenException` — no existence-leaking distinction, matching S7's
   consistent-denial pattern.
5. The server never trusts client-supplied identity, district, or
   lifecycle state. `TransitionLifecycleDto` carries only `targetState`;
   current state is always read by the server, inside the transaction.

## F. Concurrency strategy

Optimistic concurrency via an atomic conditional `UPDATE`, the exact
pattern already proven safe in S5 (`AssignmentService.assign`'s
counsellor-caseload claiming):

1. Inside `prisma.$transaction`, read the case and its current
   `lifecycleState`.
2. Validate the transition against the matrix.
3. `tx.case.updateMany({ where: { id: caseId, lifecycleState: currentState }, data: {...} })`
   — the `WHERE` guard re-checks `lifecycleState` against its latest
   committed value at lock time, using only the value this request itself
   just read.
4. If `claim.count === 0`, another request already moved the row first;
   this is reported as a real `ConflictException` (409), not silently
   ignored or retried.

This is safe under Postgres's row-locking semantics regardless of
isolation level: only the first `UPDATE` to reach the row wins; the
second's `WHERE` clause no longer matches. Proven twice:
- **Unit level**: `lifecycle.service.spec.ts` intercepts `case.findUnique`
  to mutate the row out-of-band between read and write, asserting the
  stale request gets `ConflictException` and the real committed state is
  preserved.
- **Real PostgreSQL (required)**: `lifecycle.integration-spec.ts`'s
  "concurrent transitions" suite fires two genuinely concurrent HTTP
  `PATCH` requests at the same case (`MONITORING → ESCALATED` racing
  `MONITORING → PAUSED`) via `Promise.all`, against a real disposable
  Postgres cluster. Exactly one returns 200 and the other 409 on every
  run; the final row matches whichever one won; exactly one audit row is
  written.

## G. Opt-out foundation

Reaching `targetState === 'OPTED_OUT'` on a case also stamps
`VictimProfile.optedOutAt` (new nullable column) for that case's victim, in
the SAME transaction as the case's own lifecycle write — an upsert, since a
`VictimProfile` row may not yet exist. This is state only: no scheduled
outreach is actually cancelled and no purge is triggered (S8's explicit
scope limit). See section K for the deferred workflow.

## H. Audit hook

Reuses S7's `StaffAuditService.record(...)`, extended (not replaced) with
an optional 5th `client` parameter so the audit `INSERT` participates in
the SAME database transaction as the lifecycle mutation it records — found
and fixed during this slice's own design review (see "Known limitations"
below for what this does and doesn't guarantee). Every successful
transition writes exactly one row: `staffId`, action code
`'lifecycle.case.transition'`, `resourceType: 'case'`, `resourceId: caseId`.
No transcript text, victim narrative, PIN, token, password, secret, or
lifecycle state VALUE is logged — only IDs/codes, matching S7's existing
audit discipline. A denied (`ForbiddenException`) or rejected
(`ConflictException`) attempt writes zero audit rows.

## I. FastAPI coexistence

`backend/api/cases/lifecycle_routes.py::update_case_stage` remains live,
unmodified, and reachable by any of 5 staff roles. It writes to
`cases.case_stage` (the pre-existing `case_stage_enum` column: registered/
investigation/trial/compensation/rehabilitation/closed) — a DIFFERENT
column from the one this slice owns (`cases.lifecycle_state`). Node's
`LifecycleService` never reads or writes `case_stage`; FastAPI's endpoint
never reads or writes `lifecycle_state`. The two writers do not collide on
the same column, but they do represent two independently-mutable pieces of
"what state is this case in" with no synchronization between them.

## J. Known cutover gap

FastAPI's `update_case_stage` accepts an **unvalidated, arbitrary string**
for `new_stage` (a plain Pydantic `str`, no `Literal`/enum constraint) —
confirmed during the S8 dependency audit and unchanged by this slice, since
S8's explicit scope excludes any FastAPI modification. This means:
- `case_stage` can be set to any string by any of the 5 staff roles FastAPI
  authorizes for that endpoint, with no transition-matrix validation at all.
- A case's `lifecycle_state` (Node-validated) and `case_stage` (FastAPI,
  unvalidated) can diverge or tell an inconsistent story, since nothing
  keeps them in sync.
- Until FastAPI's write path is migrated to use `LifecycleService` or is
  disabled, Node does not have exclusive authority over "case lifecycle" in
  the full system sense — only over the new `lifecycle_state` column
  specifically.

This gap is not fixed in S8 by design; it is documented here so it is not
mistaken for having been closed.

## K. Future scheduling/purge dependencies

v0.2's lifecycle requires `OPTED_OUT` to eventually cancel workflows and
purge data per policy. S8 establishes only the lifecycle/data foundation
for this:

```
OPTED_OUT -> scheduling cancellation: future
OPTED_OUT -> purge workflow: future
OPTED_OUT -> consent/event integration: future
```

None of these three workflows are implemented in this slice. Reaching
`OPTED_OUT` today only (a) validates the transition, (b) records
`victimProfiles.optedOutAt`, and (c) writes an audit row. No outbound
contact is actually cancelled, no data is purged, and no consent/event
system is notified.

## L. Security considerations

- The server never trusts client-supplied victim/user identity, staff
  identity, district, current lifecycle state, or previous lifecycle
  state — all of these are resolved server-side, inside the transaction,
  from the verified staff session token and the database's own current
  row. `TransitionLifecycleDto` carries only `targetState`; it has no
  `currentState`/`fromState`/`reason` field by design (a free-text
  "reason" risks narrative/PII entering the audit log — deferred to a
  future, more carefully-designed flow).
- Unauthenticated requests are rejected by `StaffAuthGuard` (401).
  Authenticated-but-not-staff and wrong-role requests are rejected by role
  gating (403). Authenticated-but-out-of-scope requests are rejected by
  `canMutateCase` (403), with a response identical to the nonexistent-case
  case.
- Audit records contain IDs/codes only — verified directly in tests via
  `JSON.stringify(row)` containment checks against synthetic PII markers.
- `case_id` path parameter is validated as a UUID (`ParseUUIDPipe`) before
  reaching the service.

## M. Tests

- **Unit** (`lifecycle-states.spec.ts`, `lifecycle.service.spec.ts` —
  53 tests, `FakePrismaService`): state/enum shape, every matrix edge
  (valid and invalid), self-transition rejection, terminal-state checks,
  role gating, assignment/district authorization (including the
  unrelated-ID defensive case), consistent nonexistent-vs-out-of-scope
  denial, invalid-transition rejection with state left unchanged,
  simulated concurrency race, opt-out stamping (and non-stamping for
  non-opt-out transitions), audit-row presence on success and absence on
  denial/rejection.
- **Integration** (`lifecycle.integration-spec.ts` — 16 tests, real
  disposable PostgreSQL, real HTTP via supertest): migration additivity
  and queryability, a real multi-step valid transition sequence, an
  invalid transition (409, state unchanged), a DTO-level invalid value
  (400), unauthenticated (401), non-staff and victim-token rejection
  (401/403), cross-district denial, cross-assignment denial, the
  unrelated-ID coincidence case, **two genuinely concurrent HTTP requests
  racing for the same case's lifecycle column** (409/200 split, correct
  final state, exactly one audit row), opt-out stamping over real HTTP,
  and audit-hook presence/absence (including a content check that no
  state VALUE is logged).
- **Regression**: all 107 pre-existing S4–S7 unit tests and all 4
  pre-existing S4–S7 integration suites still pass unmodified (see
  "Known limitations" for the one test-infrastructure fix this required).
  Full Python suite (89 tests) re-run and unaffected, since no Python code
  was touched.

## N. Known limitations

- **FastAPI coexistence gap** (sections I/J) is the primary limitation:
  `case_stage` remains writable, unvalidated, by 5 staff roles, entirely
  outside this slice's control.
- **Audit atomicity was a real, self-caught bug, now fixed**: `LifecycleService`
  originally called `StaffAuditService.record(...)` using the injected
  top-level `PrismaService` from inside a `prisma.$transaction` block —
  meaning the audit `INSERT` would run on a separate connection, outside
  the transaction's atomicity boundary. Fixed by extending `record()` to
  accept an optional transaction-aware client parameter (mirroring S5's
  own established pattern for `IdentityService`/`AssignmentService`),
  fully backward-compatible with S7's existing 4-argument calls.
- **Older integration suites required a migration-list update**: since the
  Prisma schema is shared across the whole app, adding `lifecycleState`/
  `lifecycleUpdatedAt` to the `Case` model means every `case.create()` call
  — including ones made by S4–S7's own integration suites — now requires
  those columns to exist. `identity.integration-spec.ts`,
  `registration.integration-spec.ts`, `onboarding.integration-spec.ts`, and
  `staff-console.integration-spec.ts` each had `0006_lifecycle.sql` added
  to their throwaway-Postgres migration list (they previously stopped at
  their own milestone's migration) so their fixture data continues to
  match what the shared Prisma Client actually expects, matching how a
  real deployment always applies every migration regardless of which
  feature is being exercised. No application code changed to accommodate
  this — only test setup.
- **No pre-`MONITORING` opt-out/pause path** exists in the validated
  matrix (see section D) — a real, plausible victim need that is
  explicitly deferred rather than guessed at.
- **Opt-out is state-only** (section K) — no workflow actually reacts to it
  yet.
- **No full audit hash-chain/WORM** — this reuses S7's minimal audit
  foundation, not v0.2's complete tamper-evident audit system.
- **No break-glass path** for the lifecycle endpoint exists yet.
