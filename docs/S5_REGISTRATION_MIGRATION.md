# S5_REGISTRATION_MIGRATION.md

Phase 1/2 record for the second Node.js `core-api` extraction slice:
**registration parity** — identity + case creation + counsellor assignment,
so Node's `/register` stops being an identity-only subset and reaches
behavioral parity with FastAPI's `/api/v1/intake/app/register` for the
functionality that exists **today**. Builds on
`docs/S4_IDENTITY_MIGRATION.md` (identity/OTP), which this document assumes
and does not repeat.

Format for Phase 1: `CURRENT COMPONENT → CURRENT LOCATION → TARGET NODE
COMPONENT → MIGRATION STATUS`. Format for Phase 2: each v0.2-relevant
behavior classified as **v0.2 requirement / existing implementation
behavior / required Node behavior / intentionally deferred**.

---

## Phase 1 — Existing FastAPI registration, traced

Traced directly from `backend/api/intake/app_routes.py::register_user`,
`backend/models/intake_models.py::AppRegistrationRequest`,
`backend/api/assignment/auto_assign.py::assign_counsellor`,
`backend/services/location_resolver.py::resolve_location`, and
`backend/schema.sql`. Not assumed correct — see the "Bugs found, not
preserved" note under Phase 6.

| Current component | Current location | Target Node component | Migration status |
|---|---|---|---|
| Request model | `AppRegistrationRequest` (`models/intake_models.py`): `name`, `role_type`, `consent_given`, `location?{lat,lng}`, `preferred_language`. No `phone_number` field (S2). | `RegisterDto` (`apps/core-api/src/identity/dto/register.dto.ts`) — unchanged from S4, already had every field this slice needs. | **Already ported (S4), no change needed.** |
| Validation | Pydantic field presence/type only — no format validation on `name`, no bound on `location.lat/lng`. | `class-validator` decorators on `RegisterDto` — same permissiveness, not tightened beyond what S4 already had. | **Already ported (S4).** |
| Victim creation | `supabase.table("users").insert(user_data)` inside `register_user` | `IdentityService.createUserForRegistration` (new in S5; the tx-aware sibling of S4's `registerVictim`) | **Ported**, now called from `RegistrationService.register` inside a transaction — see Phase 6. |
| Profile fields written | `phone_number` (from token), `name`, `role_type`, `preferred_language`, `consent_given`, `consent_timestamp` (now if consenting, else null), `location_source` (**always `"app"`, unconditionally** — see the bug note below), `location_lat`/`location_lng` (from request, else null), `location_district`/`location_state` (from `resolve_location`) | Same fields, same values, written by `IdentityService.createUserForRegistration` | **Ported, including the unconditional `location_source: 'app'` quirk** — reproduced deliberately, not "fixed" silently. See Phase 6. |
| Case creation | `supabase.table("cases").insert(case_data)` inside `register_user` | `tx.case.create(...)` inside `RegistrationService.register` | **Ported.** |
| Case fields written | `user_id`, `case_type: "unspecified"` (fixed), `intake_channel: "app"` (fixed), `case_stage: "registered"` (fixed), `assigned_counsellor_id` (from assignment, else null) | Identical fixed values, same field set | **Ported exactly** — none of these are client-controlled in either implementation. |
| CNR/FIR handling | **None.** `register_user` never reads or writes `cases.cnr`/`cases.ecourts_data` — those only exist on the separate `POST /api/v1/ecourts/search` path (`api/cases/ecourts_routes.py`), which is a different endpoint entirely, out of scope for registration in both implementations. | N/A | **Not applicable — not ported because there is nothing to port.** See Phase 4. |
| Consent interaction | A single boolean (`consent_given`) plus one timestamp. No per-scope consent (v0.2's `monitoring`/`store_transcripts`/etc. scopes do not exist anywhere in this codebase). | Same single boolean, unchanged from S4's `RegisterDto.consentGiven`. | **Ported as-is.** Per-scope consent is a v0.2 gap, not an S5 gap — see Phase 2. |
| Safety settings interaction | **None.** No duress PIN, disguise, safe word, or trusted contact exists anywhere in `register_user` or the schema. | N/A | **Not applicable in either implementation.** See Phase 2. |
| Counsellor assignment | `assign_counsellor(district, language)` (`api/assignment/auto_assign.py`), called only if `district` was resolved | `AssignmentService.assign(tx, district, language)` (`apps/core-api/src/cases/assignment.service.ts`) | **Ported, with one deliberate addition (the caseload cap) — see Phase 5.** |
| Assignment rules | District exact match -> prefer lowest-caseload counsellor supporting the language -> else district's overall lowest-caseload counsellor -> else `None` (no error) | Same three rules, same order, PLUS: only counsellors under their own `caseload_cap` are ever considered | **Ported + deliberately extended.** See Phase 5. |
| Error behavior | Generic `except Exception` around the whole handler -> `HTTPException(500, str(e))` for anything unexpected; explicit `400` only for "user insert returned no data" / "case insert returned no data" | NestJS's default exception filter (500) for unexpected errors; explicit `ConflictException` (409) for duplicate phone; `ValidationPipe` (400) for malformed DTOs | **Not identical, deliberately.** Node's errors are more specific (409 vs FastAPI's generic 400/500 for the same duplicate-phone case) — this is an improvement already established in S4 for identity errors, extended here to registration. Not flagged as a v0.2-driven change; it's ordinary error-handling hygiene. |
| Transaction boundaries | **None at all.** Three independent Supabase calls (user insert, counsellor caseload update inside `assign_counsellor`, case insert), each committed independently. | One `prisma.$transaction` wrapping all three | **Deliberately NOT preserved — see Phase 6, this is treated as a bug fix, not a behavior change requiring product sign-off.** |
| Database writes | `users` (insert), `counsellors` (update, inside assignment), `cases` (insert) — three separate tables, three separate Supabase round-trips | Same three tables, same three logical writes, one Postgres transaction | **Same tables (Phase 3 requirement: no duplicate tables), different transactional envelope.** |
| Response format | `{status, user_id, case_id, token, token_type}` — **snake_case** | `{status, userId, caseId, token, tokenType}` — **camelCase** | **Ported field-for-field, casing NOT matched — see Phase 9.** |

### Bugs found, not preserved (Phase 1's "do not assume the old implementation is correct")

1. **`location_source` is set to `"app"` unconditionally**, even when
   `request.location` is entirely absent from the request. This looks like
   an oversight (every other location field correctly checks
   `if request.location else None`) rather than a deliberate design choice.
   Node reproduces it exactly anyway — Phase 1's job is behavioral parity
   for what exists today, and silently "fixing" a response field that nothing
   currently depends on being wrong would be exactly the kind of
   undocumented behavior change the task instructs against. Flagged here so
   it's a known, intentional carry-over, not a missed bug.
2. **No transaction boundary**, covered in full in Phase 6 — this one *is*
   deliberately not preserved, because the task's own Phase 6 instruction
   explicitly calls out this exact failure mode ("do not create a victim
   successfully while silently failing case creation unless legacy behavior
   explicitly requires it" — it does not; nothing in the codebase or
   `docs/AAVAZ_MIGRATION_PLAN.md` treats non-atomic registration as
   intentional).
3. **No caseload cap**, covered in Phase 5 — a real correctness gap (a
   single counsellor's caseload is unbounded today) that v0.2 explicitly
   requires be fixed, not merely documented.

---

## Phase 2 — v0.2 reconciliation

| Area | v0.2 requirement (Workflow A, §12 data model) | Existing implementation | Required Node behavior (this slice) | Deferred |
|---|---|---|---|---|
| **Age gate** | A1: "Are you 18 or older?" is the first question after language; a "no" answer stops self-onboarding, shows child-helpline/OSC info, and creates an unlinked handoff task — the minor's details are never stored in the adult flow. | **None.** `AppRegistrationRequest` has no age field at all. The mobile `RegisterScreen.jsx` collects an `age` text field in local component state but **never sends it to the backend** — it's used only in the client's own local `onCompleteSetup` callback. | **None implemented.** Node's `RegisterDto` does not gain an age field in this slice. | **Yes — explicitly deferred.** Implementing this properly needs a minor-handoff task path, which needs a task/oversight domain that doesn't exist yet (out of this slice's STOP conditions). Silently adding an age field with no enforcement would be worse than not having one — it would look like a real gate without being one. |
| **Consent scopes** | A2: one scope per screen — `monitoring` (required), `store_transcripts`, `voice_recording`, `share_mental_health`, `share_legal_aid`, `share_welfare`, `share_protection` — each grant hashed and stored as its own row in a `consents` table. | A single `consent_given` boolean, one timestamp, no scopes, no per-consent audit trail. `ConsentScreen.jsx` exists in the mobile app but is unused by the actual registration flow (per `docs/AAVAZ_MIGRATION_PLAN.md` §3's own finding). | **Unchanged from S4/existing: one boolean.** Building a real `consents` table and per-scope capture is explicitly out of this slice — it's its own future migration slice (the STOP conditions name "consent service" directly). | **Yes.** |
| **Profile creation (A3)** | Alias/name, language, district, relation to case, crime category, preferred channel, safe contact windows, "safe to call at all". | Name, language, and a district resolved from a **mocked** geocoder (see below). No relation-to-case field, no crime category, no preferred channel, no safe windows. | **Unchanged.** Node's `RegisterDto` matches the existing (narrower) field set exactly — extending the profile shape is `profile-case` domain work, named as future work, not silently added here. | **Yes**, except the district piece — see next row. |
| **District resolution** | (Implied by A3/A6 — a real district is needed for assignment.) | `services/location_resolver.py::resolve_location` is an explicit **mock**: any non-null `(lat, lng)` returns the hardcoded strings `"Mock District"`/`"Mock State"`, regardless of actual coordinates. Its own comment says a real implementation would call a geocoding API. | **Ported 1:1** (`apps/core-api/src/cases/location.service.ts`) — the SAME mock, not a new one, because without it Node's counsellor assignment could never fire at all, defeating this slice's purpose. Clearly labeled as a mock in code comments and logs, exactly like the Python original. | Real reverse geocoding — **yes, deferred**, not attempted here. |
| **Case creation (A4 — case identifiers)** | CNR validated against `^[A-Z]{4}[0-9]{12}$`, queued for verification; FIR number/police station/year stored encrypted, marked for manual verification. Registration continues if neither is available. | **None at all in registration.** `register_user` never accepts or sets `cnr`/FIR fields. (A *different* endpoint, `POST /api/v1/ecourts/search`, sets `cases.cnr`/`cases.ecourts_data` — a live-schema-only pair of columns not present in `schema.sql`, confirmed via `git`/code search, same drift already flagged in S3/S4.) | **None.** Since neither implementation's registration path touches case identifiers, there is nothing to port. Node's `Case` Prisma model does not include `cnr`/`ecourts_data` at all — seePhase 4. | **Yes** — CNR/FIR capture-at-registration is new v0.2 functionality, not an existing behavior to port, and building it (validation regex, encryption, manual-verification workflow) is out of this slice. |
| **Safety setup (A5)** | Optional app disguise, duress PIN (Argon2id, distinct from login PIN), trusted contact, safe word, quick-exit control. | **None anywhere in the codebase.** No `safety_settings` table, no duress PIN, no disguise. | **None.** | **Yes** — explicitly named in the STOP conditions ("safety-settings domain"). |
| **Assignment (A6)** | District + language + **lowest active caseload below a cap (default 80)**; no match creates an unassigned task for the district supervisor. | District + language + lowest caseload, **no cap**, no supervisor-task fallback (silently assigns to the lowest-caseload counsellor in-district regardless of language if no language match, or leaves unassigned if the district has zero counsellors). | **Cap: implemented** (per-counsellor `caseload_cap` column, see Phase 5). **Supervisor task: NOT implemented** — no `tasks` table/domain exists; "no match" still falls back to a silently-unassigned case, identical to today. | Supervisor-task fallback — **yes, deferred**, explicitly flagged rather than faked. |
| **Baseline check-in (A7)** | Scheduler starts the victim's long-running check-in workflow and runs a short baseline session immediately after registration. | **None.** No scheduler, no check-in workflow exists anywhere in the codebase. | **None.** | **Yes** — explicitly named in the STOP conditions ("scheduling", "baseline check-in"). |
| **Lifecycle state** | An 11-state machine on the `victims` row itself: `PENDING_CONSENT -> REGISTERED -> VERIFIED -> MONITORING -> ESCALATED/REFERRED/PAUSED/CLOSING -> CLOSED/OPTED_OUT -> PURGED`. | A 6-value `case_stage` enum (`registered, investigation, trial, compensation, rehabilitation, closed`) on the **case**, not the victim — a materially different model (per-case litigation stage, not per-victim support lifecycle). | **Unchanged — still the existing 6-value `case_stage` enum**, via the `CaseStage` Prisma enum (`prisma/schema.prisma`), mapped 1:1 to `case_stage_enum`. Registration sets it to `'registered'`, matching existing behavior exactly. | **Yes** — migrating to the v0.2 lifecycle machine is its own data-migration-bearing slice (`docs/AAVAZ_MIGRATION_PLAN.md` §4 step 5 already names this as a distinct future step), not attempted here. |

**Summary per this phase's stated goal:** (1) necessary existing product
behavior (identity + case + assignment, exactly as it works today) is
preserved; (2) Node now correctly owns the writes for `users`, `cases`, and
`counsellors` for this flow; (3) every v0.2 onboarding capability this slice
does NOT implement is listed above, not silently treated as done.

---

## Phase 3 — Node domain ownership

Same discipline as S4: **do not assume `schema.sql` is authoritative**, use
real introspection. A second throwaway-PostgreSQL introspection pass was run
(isolated cluster, port 55434, torn down immediately after) with
`backend/schema.sql`, `backend/migrations/0002_otp_codes.sql`, **and the new
`backend/migrations/0003_counsellor_caseload_cap.sql`** applied, then
`prisma db pull --print` was run for real and reviewed in full (all 7 tables,
9 base enums, confirmed unchanged from S4 plus the one new column). Real
CRUD — including the exact atomic-conditional-update transaction pattern
`AssignmentService` uses in production — was smoke-tested against that
instance before being torn down. `apps/core-api/prisma/schema.prisma` now
additionally models `Case` (-> `cases`) and `Counsellor` (-> `counsellors`),
hand-pruned the same way `User`/`OtpCode` were in S4: only the columns and
relations this slice's code actually reads or writes are included.
`interactions`, `sos_events`, and `case_updates` remain unmodeled — no owning
logic for them exists yet.

**No duplicate tables were created.** `cases` and `counsellors` are the
exact same physical tables FastAPI's `register_user`/`assign_counsellor`
already read and write — Node was pointed at them via introspection, not
handed a fresh schema.

**One new column, via one new additive migration**:
`backend/migrations/0003_counsellor_caseload_cap.sql` adds
`counsellors.caseload_cap INT NOT NULL DEFAULT 80`. Additive only (matches
the `0002_otp_codes.sql` pattern exactly): every existing row is valid
immediately via the default, nothing existing is renamed or dropped, and
FastAPI's own `auto_assign.py` continues to work completely unchanged — it
simply never selects the new column, exactly as it already ignores every
other column it doesn't use.

**No ORM other than Prisma was introduced.** **Python does not write to
`cases` or `counsellors` from any new code in this slice** — FastAPI's
existing `register_user`/`assign_counsellor` are untouched and keep writing
to those tables exactly as before (see Phase 8 for what that means for
dual-authority risk).

---

## Phase 4 — Case creation

Implemented in `RegistrationService.register` (`apps/core-api/src/identity/registration.service.ts`):
a single `tx.case.create(...)` inside the same transaction as user creation
and assignment, with the four fixed values `register_user` also uses
(`caseType: 'unspecified'`, `intakeChannel: 'app'`, `caseStage:
'registered'`, `assignedCounsellorId` from assignment or null) — none of
these are client-controlled in either implementation.

**Case identifiers**: as established in Phase 1/2, registration in *neither*
implementation touches CNR/FIR. Node's `Case` Prisma model does not include
`cnr` or `ecourts_data` fields at all — not because they were stripped out,
but because they were never introspected into this schema in the first
place (schema.sql doesn't define them, and this slice's own migration
doesn't add them). This is enforced structurally, not just by convention: a
`prisma.$queryRawUnsafe('SELECT cnr FROM cases ...')` against this schema's
database fails at the database level, proven in
`test/registration.integration-spec.ts`'s "no fabricated CNR/legal data"
test. No synthetic-looking CNR/FIR value is fabricated anywhere in
application code; test fixtures use only obviously-synthetic phone numbers
(`+9100000011xx` patterns), never CNR-shaped strings.

---

## Phase 5 — Counsellor assignment

`backend/api/assignment/auto_assign.py::assign_counsellor` was read in full
before writing any Node code (not assumed). Its exact algorithm:

1. Fetch every counsellor in the given district, ordered by
   `current_caseload` ascending.
2. If none exist, return `None`.
3. Return the first (lowest-caseload) counsellor whose `languages` array
   contains the requested language, incrementing that counsellor's
   `current_caseload` by 1 via a separate `UPDATE`.
4. If none match the language, fall back to `counsellors[0]` (the overall
   lowest-caseload counsellor in the district), same increment.

`AssignmentService.assign` (`apps/core-api/src/cases/assignment.service.ts`)
ports steps 1–4 **exactly**, verified by a characterization-style unit test
for each step (`assignment.service.spec.ts`) and an integration test proving
the same behavior against real Postgres.

**Deliberate v0.2-driven addition**: a caseload cap. v0.2 Workflow A6
("lowest active caseload below the cap, default 80") is explicit, and v0.2's
own data model (§12) makes `caseload_cap` a **column on the staff/counsellor
row**, not a single system-wide constant — "default 80" describes that
column's default, not a shared ceiling. `AssignmentService` therefore reads
each candidate's own `caseloadCap` (from `0003_counsellor_caseload_cap.sql`,
default 80) and only ever considers counsellors currently under their own
cap; a counsellor at or over cap is treated exactly like one that doesn't
exist, for both the initial candidate list and the final atomic claim.

**Deliberately NOT ported, and explicitly flagged rather than silently
dropped**: v0.2's "no match creates an unassigned task for the district
supervisor." No `tasks` table or task/oversight domain exists in this
codebase (building one is out of this slice's STOP conditions). "No
eligible counsellor" still resolves to a silently-unassigned case
(`assignedCounsellorId: null`), byte-identical to today's behavior for the
"district has zero counsellors" case, and a genuinely new (but undocumented
in v0.2 terms) outcome for the "district has counsellors, all over cap"
case — which simply couldn't happen before this slice, since there was no
cap.

**Python must not, and does not, make assignment decisions for Node's
registration path.** `AssignmentService` is pure Node/Prisma logic; nothing
in this slice calls into `backend/api/assignment/auto_assign.py` or any
other Python code.

---

## Phase 6 — Transactional integrity

**Required transaction boundary, as implemented:** user creation + district
resolution's downstream assignment + case creation are one
`prisma.$transaction(async (tx) => {...})` in `RegistrationService.register`.
A failure at any point (duplicate phone, a thrown error inside assignment,
a case-insert failure) rolls back everything already done in that call,
including the user row.

**This is a deliberate divergence from the existing FastAPI behavior**,
which has no transaction boundary at all — see Phase 1's "bugs found, not
preserved" note. The task's own Phase 6 instruction is explicit: don't
silently preserve a victim-created-but-case-creation-silently-failed outcome
"unless the specification/legacy behavior explicitly requires such
behavior." Nothing in `docs/AAVAZ_MIGRATION_PLAN.md`,
`docs/AAVAZ_IMPLEMENTATION_AUDIT.md`, or the code's own comments treats
non-atomicity here as intentional — it reads as an oversight of a
three-Supabase-calls-in-a-row implementation, not a design decision. Node
therefore does not reproduce it.

**Failure-path test coverage** (`test/registration.integration-spec.ts`,
test 5): the real, DI-resolved `AssignmentService.assign` is made to throw
*after* the user row would have been created but *before* the case row is
created, against a real Postgres transaction. The test then queries the
real database directly and confirms **zero** user rows and **zero** case
rows exist — proving the rollback is real, not simulated.

---

## Phase 7 — Concurrency

Explicitly inspected, per the task's four minimum areas:

- **Duplicate phone registration**: `IdentityService.createUserForRegistration`
  checks for an existing phone up front (fast path) **and** catches the
  database's own unique-constraint violation (Postgres error code `P2002`)
  on the `create` call itself, translating either into a `ConflictException`
  (409). The up-front check alone has a TOCTOU race under true concurrency;
  the `P2002` catch is what actually closes it, since only one of two
  concurrent `create` calls for the same phone can ever win the database's
  own `UNIQUE (phone_number)` constraint. Proven end-to-end (real HTTP,
  real Postgres) in `test/registration.integration-spec.ts` test 7.
- **Simultaneous registration for different victims**: proven safe in
  test 9 — two victims register concurrently (real, parallel HTTP requests
  against the real app), and the test asserts neither ends up linked to the
  other's case.
- **Counsellor caseload updates / assignment race conditions**: the existing
  Python implementation reads `current_caseload` then issues an
  unconditional `UPDATE` — a textbook read-then-write race where two
  concurrent assignments can silently lose an increment, or (now that a cap
  exists) push a counsellor over their own cap. `AssignmentService` instead
  claims a candidate with one atomic, conditionally-guarded `updateMany`
  (`WHERE id = ... AND currentCaseload < caseloadCap`); Postgres evaluates
  that condition against the row's latest committed value at lock time, so
  two concurrent claims for the same counsellor can never both succeed, and
  a counsellor can never be pushed over their own cap by a race. If a claim
  is lost, the next-best candidate is tried rather than failing the whole
  registration. Unit-tested via a simulated race
  (`assignment.service.spec.ts`, "retries the next candidate...") and
  exercised for real (though not deliberately raced, since Postgres's own
  row-locking is what's actually being relied on, not a timing coincidence)
  in the integration suite's caseload-cap test.

**Not claimed as concurrency-safe, honestly**: nothing in this slice adds
distributed locking, idempotency keys, or retry-with-backoff beyond what's
described above. The safeguards implemented are exactly the ones justified
by the existing schema (a `UNIQUE` constraint that was already there for
phone numbers; a new cap column whose whole purpose is to be checked
atomically) — nothing more was invented.

---

## Phase 8 — FastAPI coexistence

**FastAPI remains the sole live authority today**, unchanged from S4's
conclusion: nothing routes real client traffic to Node's `/register` (see
Phase 9). This slice does not touch `backend/api/intake/app_routes.py`,
`backend/api/assignment/auto_assign.py`, or any other existing Python code.

**How Node registration is tested**: exclusively against isolated,
disposable PostgreSQL instances (`test/pg-harness.ts`, extracted from S4's
own throwaway-Postgres technique) — never against the shared/real
development database, and never with real victim data. Every phone number
used in any Node test is an obviously-synthetic `+9100000XXXXX`-shaped
value, matching the discipline already established in S4/S3.

**What must happen before cutover** (extends S4's identity-only version of
this question to now also cover case/counsellor writes):

1. Every real client (mobile `RegisterScreen.jsx`, and by extension
   `AuthContext.jsx`/`Login.jsx` for the OTP steps) is repointed to Node,
   verified in real use, one flow at a time — not both services live for the
   same victim's registration.
2. The response-shape mismatch (Phase 9) is resolved — either at a gateway
   layer or by a coordinated client update — so a repointed client doesn't
   silently break on `res.user_id`/`res.case_id` being `undefined`.
3. Node's registration reaches full parity with whatever FastAPI still does
   that Node doesn't yet (nothing, as of this slice — Phase 1's mapping
   above shows registration parity is now complete for existing
   functionality; the gap that remains is entirely v0.2 *new* capability,
   tracked in Phase 2, not existing-behavior parity).

**How dual-authority is avoided (today, and the plan for cutover)**: exactly
the same mechanism already documented in S4 for OTP/identity, now extended
to cover `cases`/`counsellors`: as long as only one service is ever called
for a given registration event, there is no conflict, because both services
target the *same* physical tables (Phase 3) rather than diverging copies.
**Resolving the S4 shared-secret/dual-authority concern, as this phase
requires**: the risk was, and remains, that `OTP_PEPPER`/
`VICTIM_SESSION_SECRET` are independent environment variables per service —
if both services were ever live concurrently against the same
`otp_codes`/`users` tables with *different* values for either, an OTP or
session issued by one could never be verified by the other. This is not
"resolved" by making the values equal preemptively (that would itself be a
premature architectural commitment with no live dual-service traffic to
justify it yet); it is resolved by the plan itself never calling for
concurrent dual-service live traffic in the first place — cutover (per S4
and this document) is either sequenced per-client-flow with FastAPI's path
fully retired for that flow before Node's is enabled, or the secrets are
explicitly synchronized for a short, deliberate overlap window, decided at
the time cutover is actually planned (not now, and not implicitly). No
dual-service OTP or registration traffic is live today, so this constraint
is not currently binding — it is a precondition for the *next* milestone
that attempts a real cutover, not for this one.

---

## Phase 9 — API compatibility

**Node's registration response is NOT compatible with the existing mobile
client contract as-is**, and this slice does not fix that — per the task's
explicit instruction to document rather than shortcut it.

Concretely: `mobile/src/screens/RegisterScreen.jsx` reads
`res?.user_id`, `res?.case_id`, `res?.token` (snake_case) from the response
body. FastAPI returns exactly that shape
(`{status, user_id, case_id, token, token_type}`). Node's response — both
before this slice (S4) and after it — uses camelCase
(`{status, userId, caseId, token, tokenType}`), the idiomatic convention for
a NestJS/JSON API and consistent with the rest of `apps/core-api`. If a
client were repointed at Node today without any other change, `res.user_id`
and `res.case_id` would both be `undefined`.

This is not fixed in this slice because doing so by unilaterally renaming
Node's fields to snake_case would be exactly the kind of "architectural
shortcut" the task instructs against — v0.2's own system map puts
contract translation at the `channel-gateway`/generated-client layer
(OpenAPI-driven, not hand-matched casing), which doesn't exist yet and is
explicitly out of this slice's scope. The two real options — (a) a future
gateway/BFF layer translates casing, or (b) clients are updated to read
camelCase when they're repointed to Node anyway (Phase 8 already requires
touching each client at cutover) — are both legitimate and are left as an
open decision for whoever plans the actual cutover slice, not decided here.

No frontend or mobile files were modified in this slice, consistent with
"do not change frontend/mobile yet unless strictly required for testing" —
it was not required; all new tests exercise Node's HTTP API directly via
`supertest`.

---

## Phase 10 — Tests added

**Unit** (`FakePrismaService`-backed, extended with `case`/`counsellor`
delegates and a non-atomic `$transaction` pass-through — real atomicity is
proven only at the integration level, not claimed here):

- `src/cases/assignment.service.spec.ts` — 10 tests: language-match
  preference, lowest-caseload fallback, per-row cap exclusion, independent
  per-counsellor caps, schema-default cap, exact district matching, and a
  simulated race proving the retry-next-candidate path.
- `src/identity/registration.service.spec.ts` — 7 tests: full
  registration+case+assignment composition, location persistence
  (including the unconditional `location_source: 'app'` quirk), unassigned
  case creation (no location, no eligible counsellor), duplicate-phone
  rejection at the full registration level, structural proof of no
  CNR/`ecourtsData` fields, and cross-victim case-ownership isolation.

**Integration** (`test/registration.integration-spec.ts`, real disposable
PostgreSQL via the shared `test/pg-harness.ts`, 8 tests over real HTTP):
successful registration with real counsellor assignment; transaction
rollback under a real, DI-injected failure; invalid-DTO rejection with zero
rows written; duplicate registration at the full endpoint level; concurrent
registration for two different victims; unassigned-but-successful
registration when no eligible counsellor exists; caseload-cap enforcement
against real Postgres; and a database-level proof that no CNR/legal-data
column exists to be fabricated into.

**Preserved, not modified**: all 33 S4 unit tests, all 9 S4 integration
tests (`test/identity.integration-spec.ts`, left untouched — its own
throwaway-Postgres setup was deliberately NOT refactored to share
`pg-harness.ts`, to avoid any risk to an already-passing file), and all 89
existing Python tests.

---

## Phase 11 — Security checklist

- **No client-controlled victim identity**: unchanged from S4 — still
  derived from the server-issued phone-verified token, never the request
  body.
- **No client-controlled counsellor assignment**: `RegisterDto` has no
  counsellor field; assignment is entirely server-computed inside the same
  transaction as case creation.
- **No arbitrary case ownership**: `case.userId` is always the just-created
  user's own id from the same transaction — never client-supplied, never
  another victim's id (proven in both the unit and integration suites).
- **No fabricated legal records**: registration has no CNR/FIR code path in
  either implementation; Node's schema structurally cannot represent one for
  this table (Phase 4).
- **No secrets committed**: `.env.example` additions are documentation
  comments only (no cap-related secret was ever needed, since the cap
  lives in a DB column, not an env var).
- **No OTP plaintext logging**: unaffected — this slice makes no changes to
  `otp.service.ts`.
- **No duplicate authentication authority introduced**: unaffected — no
  changes to identity/token issuance; only registration's *downstream*
  writes (case, counsellor) were extended.

---

## Remaining gaps after this slice

- Every v0.2 capability listed as "deferred" in Phase 2's table: real age
  gate, per-scope consent, extended profile fields, real district
  resolution, CNR/FIR capture at registration, safety setup, the
  supervisor-task assignment fallback, baseline check-in, and the 11-state
  lifecycle machine.
- The Phase 9 response-casing mismatch, unresolved by design (documented,
  not shortcut).
- The Phase 8 cutover precondition (client repointing + response-shape
  resolution) is not attempted in this slice.
