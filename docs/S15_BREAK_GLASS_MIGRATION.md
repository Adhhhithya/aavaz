# S15 — Break-Glass Access Foundation

Implementation record for S15. Chosen after re-auditing the dependency
graph a further time (per this master spec's section 33 discipline) and
confirming `docs/AAVAZ_MIGRATION_PLAN.md`'s Decision 5 (fabricated CNR
removal) was already complete and verified in an earlier session — with
that item closed, break-glass access (v0.2 §15) was the clearest
remaining infrastructure-independent capability: it needs no job queue,
no external SMS/push/email provider (S12's task domain already gives it
a real "notify the supervisor" mechanism), and no Python AI service.

Per the user's explicit direction when this slice's scope was confirmed,
this is the **request/record/notify foundation only** — it deliberately
does NOT modify any of the five existing domains' (console, lifecycle,
referral, task, milestone) authorization checks to actually honor a
grant. That wiring is real, valuable follow-up work, but touching five
already-tested domains' security-critical code in the same slice that
builds the grant mechanism itself would be a larger, riskier change than
this milestone's own discipline (small, reviewable, evidence-grounded
slices) calls for.

## A. Scope

**In scope:**
1. A Node break-glass domain (`apps/core-api/src/break-glass/`): a
   `break_glass_grants` table (staff, case, reason, granted_at,
   expires_at), a `request()` operation with deliberately NO case-scope
   check (the entire point of the feature), and an `isActive()` query —
   a real, tested building block, not yet consumed anywhere.
2. `expiresAt = grantedAt + 2 hours`, v0.2 §15's own stated duration,
   verbatim.
3. "Notifies the supervisor" implemented as a new task type,
   `break_glass_review` (added to `TASK_TYPES`), created automatically in
   the same transaction as the grant — reusing S12's task domain's own
   district-scoped visibility rather than needing a real notification
   provider this repository doesn't have.
4. Tests: service unit tests (the no-scope-check property itself, the
   2-hour duration, the notification task, audit/reason separation,
   `isActive` behavior including expiry and per-staff scoping) and a
   real-Postgres, real-HTTP integration suite.

**Out of scope (explicitly deferred, per the user's own confirmed
direction):**
- Wiring `isActive()` into console/lifecycle/referral/task/milestone's
  own `canMutateCase`-style authorization checks so a grant actually
  bypasses the normal scope boundary. This is the single most
  security-consequential remaining piece of this feature and deserves
  its own dedicated, carefully-reviewed slice.
- Any revocation/early-termination action for a supervisor — v0.2's text
  says a supervisor is notified, not that they can revoke; inventing a
  revoke endpoint without that evidence would be exactly the kind of
  unevidenced business rule this master spec's instructions warn
  against.
- Any FastAPI change — no FastAPI break-glass equivalent exists anywhere
  in the real schema (confirmed absent by the same method
  `docs/S8_DEPENDENCY_AUDIT.md` section E used for every prior domain) —
  pure net-new capability.

## B. Why `reason` breaks this codebase's own "IDs and codes only" rule
— deliberately, and in isolation

Every audit-adjacent write in this codebase up to this slice has
followed one strict rule: `staff_audit_log` never carries free text,
only closed action/resource-type codes plus IDs. Break-glass's own
`reason` field is different in kind — v0.2 §15 explicitly calls for "a
typed reason," which is inherently a human-authored justification for an
emergency access exception, not a code. Rather than either (a) violating
`staff_audit_log`'s own invariant by writing reason text into its
existing `reason` column (reserved and NULL for every row since S7), or
(b) silently dropping the requirement, `reason` lives on its own,
dedicated `break_glass_grants` table — the audit log still records only
`break_glass.requested`/`case`/`caseId` (IDs and codes), and a supervisor
or compliance reviewer who needs the actual justification reads it from
the grant record, not the audit trail. This mirrors the same "genuine
staff-entered content belongs in its own typed field, not the audit
log's codes-only columns" precedent `docs/S9_REFERRAL_MIGRATION.md` and
`docs/S13_MILESTONE_MIGRATION.md` already established for referral
packet fields and milestone dates.

## C. Role gating: still excludes the oversight tier

`CONSOLE_INDIVIDUAL_RECORD_ROLES` gates `request()` — `state_admin`/
`national_admin` cannot request break-glass, same as every other
individual-record endpoint in this codebase. v0.2's own role table
places district/state oversight in a categorically different,
aggregate-only tier ("Cannot see: Any individual record") and never
describes break-glass as a mechanism for THAT tier to gain individual
access — extending it to them would contradict the very access model
break-glass exists within, not merely be unevidenced.

## D. Priority default (not spec-evidenced, stated plainly)

`break_glass_review` tasks are created with `priority: 'critical'` — v0.2
§15 names no priority for this task type. `critical` was chosen because
an out-of-scope access grant is, by construction, an exception to this
system's core authorization boundary — the most consequential category
of event this codebase's existing priority vocabulary has a word for.
Recorded here as this slice's own considered default, the same
discipline `docs/S14_TASK_TRIGGER_EXTENSION.md` used for
`unassigned_case`'s own `bad` priority default.

## E. Tests

- **Unit** (`break-glass.service.spec.ts` — 11 tests, `FakePrismaService`):
  the defining no-scope-check property (a counsellor can request access
  to a case outside their own assignment), the exact 2-hour duration,
  oversight-tier exclusion, nonexistent-case rejection, the automatic
  notification task's shape (type/priority/system-actor), audit/reason
  separation (the real reason never appears in the audit log, but IS
  retrievable from the grant), and `isActive`'s full behavior (active,
  expired, wrong-staff, never-granted).
- **Integration** (`break-glass.integration-spec.ts` — 9 tests, real
  disposable PostgreSQL, real HTTP via supertest): migration additivity,
  a real cross-scope request over real HTTP, the notification task's
  real visibility in a genuine district supervisor's `GET /v1/console/
  tasks` response, reason/audit separation against persisted rows,
  DTO validation (too-short reason, 400) and nonexistent-case (404),
  unauthenticated/oversight-tier denial, and — the single most important
  test in this suite — a district_admin scoped to Pune successfully
  requesting break-glass for a Mumbai case, the exact scenario every
  OTHER domain in this codebase would reject with 403.
- **Regression**: full S1-S14 unit suite (301 tests before this slice's
  own 11 new tests) and integration suite (129 tests before) both re-run
  unmodified — no other suite's migration list or cleanup order needed
  changing, since nothing else in this codebase calls `BreakGlassService`
  yet (by design — see Section A). 312 unit tests and 138 integration
  tests total after this slice.

## F. Known limitations

- **No domain actually honors a grant yet** — Section A's single largest,
  explicitly-deferred item. `isActive()` is real and tested, unconsumed.
- **No revocation path** — Section A.
- **No FastAPI equivalent to reconcile** — none exists.
