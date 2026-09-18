# S9 — Referral Domain Foundation

Implementation record for S9, the slice chosen from the three independent,
evidence-based candidates `docs/S8_DEPENDENCY_AUDIT.md` section L identified
as buildable with no infrastructure blocker: referral foundation, audit
hash-chaining, oversight. Referral was chosen because it is the most
substantial operational domain (getting a victim real help), its
prerequisites (consent — S6, case data — S5, and now lifecycle — S8) are
all real and tested, and v0.2 names a concrete, evidence-based security
risk (per-destination data minimization) worth building correctly from day
one rather than retrofitting later.

## A. S9 scope

**In scope:**
1. A Node referral domain (`apps/core-api/src/referral/`).
2. The v0.2 12-state referral lifecycle (Workflow G) with an explicit
   transition matrix — not mere enum-membership checking.
3. A consent gate: any transition into `SENT` requires the destination's
   matching `share_*` consent scope to be **currently** granted, checked
   server-side against the real `consents` table inside the same
   transaction — never a client-supplied claim.
4. Structural, compile-time-enforced data minimization: each of the 4
   destination types (`mental_health`, `legal_aid`, `welfare`,
   `protection`) has its own TypeScript packet interface containing ONLY
   the fields v0.2's "Minimum necessary data per destination" table lists
   for it.
5. SLA timestamp computation (`ackDueAt`, `serviceDueAt`) using v0.2's own
   two SLA checkpoints (3 working days to acknowledge, 10 to start
   service), and an idempotency key (`referralId:attemptCount`).
6. Authenticated staff authorization, reusing S7/S8's exact
   `StaffAuthGuard`/`CONSOLE_INDIVIDUAL_RECORD_ROLES`/
   `ASSIGNMENT_SCOPED_ROLES` pattern — no new authorization model invented.
7. Concurrency-safe transitions via the same atomic conditional-`UPDATE`
   pattern S5/S8 already proved, verified against real, disposable
   PostgreSQL with genuinely concurrent HTTP requests.
8. An audit hook, extending S7's `StaffAuditService` with
   `referral.drafted`/`referral.transition`/`referral.read` action codes.
9. An additive-only migration (`backend/migrations/0007_referrals.sql`).
10. Tests: state-machine unit tests, service unit tests (role gating,
    assignment/district scoping, data-minimization structural checks,
    consent gate, SLA stamping, concurrency, audit hook), and a real-HTTP,
    real-PostgreSQL integration suite covering the same properties plus a
    genuine concurrent-request race.

**Out of scope (explicitly deferred):**
- Puppeteer PDF rendering (v0.2 "G2") — packets are stored as structured
  JSON (`packetData`), not rendered documents. No PDF library exists in
  this codebase's Node side; adding one for a single slice's document
  step would be new infrastructure introduced for reasons unrelated to
  domain-logic correctness.
- Real delivery adapters (encrypted-email-with-SMS-password, agency-portal
  manual entry, future agency APIs) — v0.2 "G3". `idempotencyKey` is
  computed and stored (the value a future adapter needs) but nothing
  consumes it yet, the same "state now, behavior later" pattern S8 used
  for `optedOutAt`.
- Automated SLA-breach detection (a worker/timer moving `SENT`/
  `ACKNOWLEDGED` to `STALLED` on its own) — no job queue exists (S8
  audit section F/I). `STALLED` is reachable only via an explicit
  staff-initiated transition in this slice; a future `workers` slice
  would call the exact same `ReferralService.transition(...)` method a
  human caller does today.
- Legal-issue detection, needs-extraction, or any other automated source
  for the staff-entered packet fields (`needSummary`, `legalIssueSummary`,
  `reliefStagePending`, `threatLog`) — none of these pipelines exist
  (confirmed absent by the S8 audit's Section D/G). These fields are
  always staff-authored, matching v0.2's "the case manager previews it
  before sending" (G2), which implies active human authorship, not a
  purely system-generated document.
- Any FastAPI change — no FastAPI referral capability exists to coexist
  with (confirmed absent from the real 12-table schema, S8 audit Section
  E), so this is pure net-new capability with zero dual-writer risk.
- Any frontend/mobile change.
- `H1`-`H4` (closed-loop verification via `post_referral` check-ins) and
  the `H3` escalation-ladder notification behavior — both depend on
  scheduling/check-in infrastructure that does not exist yet (S8 audit
  Section I).

## B. Transition-matrix reconstruction methodology

Same technique as S8's lifecycle diagram (`lifecycle-states.ts`'s header):
v0.2's referral-lifecycle diagram (Workflow G, PDF pages 17-18) was
re-extracted directly from the PDF for this slice — via
`page.get_text('words')`, grouped by `(block, line)` so each label's X/Y
bounding box is known — rather than trusting either of two prior,
disagreeing summaries (`docs/S8_DEPENDENCY_AUDIT.md`'s prose compresses
it to "a 9-state lifecycle"; this master spec's own requirements list 12
states including `DISCARDED`). The PDF's actual diagram has exactly 12
node labels, matching the master spec's list, not the audit's compressed
paraphrase — confirmed by direct re-extraction, per this milestone's
instruction to treat the actual PDF as authoritative over any summary.

The full node-position and edge-label trace, and every "deliberately not
included" decision with its reasoning, lives in
`apps/core-api/src/referral/referral-states.ts`'s header comment — not
duplicated here. Two edges required judgment calls beyond raw position:

- **"not needed" vs. a DRAFTED→SENT shortcut**: read as "the consent
  check is not needed because the scope is already granted" (an
  `APPROVED → SENT` edge), not as "case-manager approval is not needed."
  Chosen because the label sits in the same y-band as two other
  consent-outcome labels, not near the earlier, separately-positioned
  "case manager approves" label — and because G1's prose directly
  supports a consent check gating entry to `SENT`.
- **The two "SLA breached" appearances / "re-sent or escalated"**: G5
  names exactly two SLA checkpoints (acknowledgement, service start), so
  both `SENT → STALLED` and `ACKNOWLEDGED → STALLED` are modeled from the
  single diagram label, rather than picking one arbitrarily. `STALLED`'s
  two outgoing edges (`→ SENT`, `→ CLOSED_UNRESOLVED`) map directly to
  the label's own two words ("re-sent", "escalated").

## C. Data-minimization design (v0.2's "Minimum necessary data per
destination" table, PDF page 18)

Enforced structurally, not by convention — see
`apps/core-api/src/referral/referral-destinations.ts` and
`referral-packets.ts`. Each destination has its own packet interface with
only its allowed fields; the builder function for one destination has no
parameter through which another destination's disallowed fields (distress
score, transcripts, FIR/CNR, counselling notes) could reach it. This is a
compile-time property: adding a field to `MentalHealthPacket` that isn't
in v0.2's table would require deliberately widening
`SystemKnownFields`/`MentalHealthStaffInput` and the builder body — it
cannot happen by accidentally reusing a shared "packet" type.

**KNOWN GAP, stated plainly rather than fabricated**: `cnr`, `fir`,
`court`, and `nextHearingAt` are NOT modeled anywhere in Node's Prisma
schema (confirmed absent, `schema.prisma`'s own header — still
FastAPI-owned via `cases.ecourts_data`, S1/S3/S8's own findings). The
`legal_aid` and `welfare` packets always set these to `null`, never a
placeholder or invented value. A case manager previewing a legal-aid
referral today will see a real name and a real, staff-typed legal-issue
summary, but no automatically-populated CNR/court/hearing-date — this is
an honest reflection of what Node actually knows, not a defect introduced
by this slice. Closing this gap requires either migrating `cnr`/
`ecourts_data` into Node's schema (a separate, larger decision — see
`docs/AAVAZ_MIGRATION_PLAN.md` §1's eCourts-integration note) or a case
manager manually typing the CNR into a future packet-editing step.

**Distress score is deliberately never included anywhere**, even though
`Case.currentDistressScore` exists and superficially resembles v0.2's
"current distress level" field for the `mental_health` packet. Excluded
because it is confirmed to be a keyword-substring-match simulation, not a
real clinical signal (S8 audit Section D/P: `fusion.py`'s
"STEP 3: Execute LLM (Simulated for this prototype...)"), and presenting
simulated data as if it were a real distress signal to an external
mental-health provider would misrepresent it — exactly the concern this
master spec's AI-boundaries section raises about not calling a simulation
a clinical signal. Proven by test (`referral.service.spec.ts`'s
data-minimization block asserts the literal value `42` — a synthetic,
obviously-fake distress score seeded in the test case — never appears
anywhere in a drafted mental-health packet).

## D. Consent gate

v0.2 Workflow G "G1": "Before SENT, the matching share_* consent must be
granted." Implemented as a uniform check applied to every transition whose
**target** is `SENT` — the initial `APPROVED → SENT` edge, the
`AWAITING_CONSENT → SENT` edge, the `BOUNCED → SENT` retry, and the
`STALLED → SENT` re-send all go through the identical
`isConsentCurrentlyGranted` check inside the same database transaction as
the state mutation. This means consent revoked between an initial send and
a later retry is caught — proven by test
(`referral.service.spec.ts`/`referral.integration-spec.ts`, "the consent
gate applies uniformly to a bounce-retry").

The check reads the real `consents` table directly (most-recent row for
`(userId, scope)`, inside the same `prisma.$transaction` as the referral
mutation) rather than calling `ConsentService.getCurrentConsents` — S8's
own "Known limitations" section documents a real, self-caught bug where
calling a sibling service's method from inside a transaction used that
service's own injected (non-transactional) `PrismaService`, running the
call on a separate connection outside the transaction boundary. This
slice avoids repeating that bug by keeping the read inside
`ReferralService`'s own transaction client from the start, at the cost of
a small, documented duplication of "get latest row for a scope" logic
already present in `consent.service.ts`.

## E. SLA timestamps

`ackDueAt = sentAt + 3 working days` (Mon-Fri; v0.2 does not specify a
holiday calendar, and inventing one would be an unevidenced business
rule — stated plainly in `referral-sla.ts` rather than silently assumed).
`serviceDueAt = sentAt + 10 working days`, computed at the moment of
`ACKNOWLEDGED` (both SLA checkpoints are read as counted from the send
event, per G5's own phrasing — a stated assumption, not proven by
additional diagram evidence).

## F. Authorization model

Identical shape to S7's `ConsoleService` and S8's `LifecycleService`,
reused rather than reinvented — see `referral.service.ts`'s
`canMutateCase`. Every draft/transition/read operation resolves
authorization through the case the referral belongs to: role gate via
`CONSOLE_INDIVIDUAL_RECORD_ROLES` (excludes `state_admin`/
`national_admin`, per v0.2's oversight-tier-sees-aggregates-only rule),
then assignment ownership (`counsellor`, via the Decision-1
`staff.counsellorId` bridge) or district-scope membership (`supervisor`/
`district_admin`). A nonexistent case/referral and an out-of-scope one
produce the byte-identical `ForbiddenException`, matching S7/S8's
consistent-denial pattern.

## G. Concurrency strategy

Identical pattern to S8's `LifecycleService.transition` (itself modeled on
S5's counsellor-caseload claiming): read the current `status` inside
`prisma.$transaction`, validate against the matrix, then
`tx.referral.updateMany({ where: { id, status: currentState }, data: {...} })`
— the `WHERE` guard re-checks `status` against the value this request
itself just read. Zero rows affected means another request already moved
it first, reported as a real `ConflictException` (409), never silently
ignored. Proven at the unit level (a simulated race via `findUnique`
interception) and against real PostgreSQL with two genuinely concurrent
HTTP requests (`referral.integration-spec.ts`).

## H. Audit hook

Extends `StaffAuditService`'s closed action-code set with
`referral.drafted`/`referral.transition`/`referral.read` and resource type
`referral` — the same additive pattern S8 used for
`lifecycle.case.transition`/`case`. Every draft and every successful
transition writes exactly one row (`staffId`, action code, `resourceType:
'referral'`, `resourceId: referralId`); a denied or rejected attempt
writes zero. No packet content, staff-entered text, or state value is
ever logged — verified by test via `JSON.stringify(row)` containment
checks against a synthetic sensitive-content marker seeded into a packet
field.

## I. FastAPI coexistence

None required. No `referrals` table, endpoint, or equivalent capability
exists anywhere in the FastAPI monolith (confirmed absent, S8 audit
Section E's 12-table enumeration) — this is genuinely net-new capability
with zero dual-writer risk, unlike every domain the S8 audit flagged as
having a live coexistence hazard (`cases.case_stage`, `cases.cnr`/
`ecourts_data`).

## J. Database migration

`backend/migrations/0007_referrals.sql` — one new table (`referrals`),
additive only (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
EXISTS`), no `ALTER`/`DROP`/`TRUNCATE`/`DELETE` against any existing
table. RLS enabled with no permissive policy attached, matching every
migration's convention since `0002_otp_codes.sql` — the service-role
connection bypasses RLS regardless; application-layer authorization
(`referral.service.ts`) is the actual enforcement point.

**Unlike S8's `0006_lifecycle.sql`**, this migration adds no columns to
any existing table — only a new table with its own columns. Because
Prisma's generated queries for `User`/`Case`/`Staff` rows that don't
explicitly `include: { referrals: true }` never reference the `referrals`
table at all, the other S4-S8 integration suites' throwaway-Postgres
migration lists did **not** need `0007_referrals.sql` appended (verified
by running the full existing integration suite unmodified — all 6 prior
suites, 92 tests, still pass with no changes to their own migration
lists). This is a real, load-bearing difference from S8's own
"Known limitations" note about every prior suite needing an update —
stated here so a future reader doesn't assume every new migration always
requires that same change.

## K. Tests

- **Unit** (`referral-states.spec.ts` — 20 tests; `referral.service.spec.ts`
  — 31 tests, `FakePrismaService`): full transition-matrix coverage
  (valid/invalid/self-transition/terminal-state), role gating,
  assignment/district authorization (including consistent nonexistent-
  vs-out-of-scope denial), data-minimization structural assertions for
  all 4 destinations, consent-gate behavior (missing, granted, revoked,
  and uniform application to a bounce-retry), SLA timestamp stamping,
  simulated concurrency race, audit-row presence on success and absence
  on denial/rejection.
- **Integration** (`referral.integration-spec.ts` — 17 tests, real
  disposable PostgreSQL, real HTTP via supertest): migration additivity
  and queryability, a full real-HTTP happy-path sequence through all 7
  forward states, the consent gate over real HTTP (409 then 200 once
  granted), invalid transitions (409) and DTO-level validation (400) for
  both target state and destination type, a missing required
  staff-entered field (400), unauthenticated/non-staff/oversight-tier
  denial (401/403), cross-district and cross-assignment denial, **two
  genuinely concurrent HTTP requests racing for the same referral's
  status column** (409/200 split, correct final state, correct audit-row
  count), and audit-hook presence/absence including a sensitive-content
  containment check.
- **Regression**: the full existing S4-S8 unit suite (160 tests) and
  integration suite (75 tests across 5 suites) both re-run and pass
  unmodified — 211 unit tests and 92 integration tests total after this
  slice.

## L. Known limitations

- **No PDF rendering, no delivery adapter, no automated SLA-breach
  detection** — see Section A's "Out of scope" list. `STALLED` and every
  post-`SENT` state today require an explicit staff HTTP call; nothing
  reacts automatically yet.
- **`legal_aid`/`welfare` packets cannot auto-populate CNR/FIR/court/
  hearing date** — Section C's "KNOWN GAP." Real, not a bug; the
  underlying data does not exist in Node's schema yet.
- **No `DRAFTED → DISCARDED` path** (a case manager discarding a bad
  draft outright) — no diagram or prose evidence supports this edge; the
  only evidenced path to `DISCARDED` is via a victim declining consent.
  A real, plausible need, deferred rather than guessed at (same
  discipline S8 used for its own deferred pre-`MONITORING` opt-out edge).
- **No `H1`-`H4` closed-loop verification workflow** — depends on
  scheduling/check-in infrastructure this repository does not have.
- **`idempotencyKey` is computed but unconsumed** — no delivery adapter
  exists yet to actually use it for retry deduplication.
