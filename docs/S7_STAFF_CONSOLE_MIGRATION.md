# S7_STAFF_CONSOLE_MIGRATION.md

Implementation record for the fourth Node.js `core-api` extraction slice:
**staff identity + console authorization foundation**. Builds on
`docs/S4_IDENTITY_MIGRATION.md`, `docs/S5_REGISTRATION_MIGRATION.md`,
`docs/S6_ONBOARDING_MIGRATION.md`, and the read-only
`docs/S7_STAFF_CONSOLE_AUDIT.md` (which this document assumes and does not
repeat findings from).

---

## Locked architectural decisions

These two decisions were fixed before any code was written, per explicit
instruction, and every design choice below follows from them.

### Decision 1 — Staff identity

**No second competing staff/counsellor system was created.** The audit
(Section B) found two pre-existing, structurally unlinked concepts: (a)
`users` rows with a staff-shaped `role_type` (authentication-capable, no
caseload/district data), and (b) the `counsellors` table (a pure
assignment-target record, no login capability). Neither alone is v0.2's
`staff` model, and nothing anywhere linked them.

This slice adds a new `staff` table as an explicit **bridge**, not a
replacement:

```
authenticated user (users.id)
        ↓  staff.user_id  (UNIQUE)
    staff identity (staff.id)
        ↓  staff.counsellor_id  (NULLABLE)
existing counsellor identity (counsellors.id) — only where applicable
```

Application code enforces this invariant structurally: `apps/core-api/src/staff/staff.service.ts::getStaffForUser` is the **only** way a `userId` resolves to anything, and it never looks up or compares a `counsellors.id` directly against a `users.id`. `apps/core-api/src/console/console.service.ts` only ever compares `staff.counsellorId` (resolved through the bridge) to `case.assignedCounsellorId` — never `staff.userId` to anything counsellor-shaped. This is regression-tested explicitly (see "Security tests" below, item 8).

`role_type_enum` incompatibility (audit Section C/G) was handled explicitly, not silently: `staff.role` is a **new**, free-TEXT column (`apps/core-api/src/staff/staff-roles.ts` validates it at the application layer against a small allow-list), not a reuse of `users.role_type_enum`. This is the same "avoid an `ALTER TYPE`, validate at the application layer" choice already made for `otp_codes.purpose` (S2) and `consents.scope` (S6) — not a new pattern invented for this slice.

**No historical data was fabricated.** `backend/migrations/0005_staff.sql` creates `staff` **empty**. No existing `users` row was inferred to be linked to any existing `counsellors` row — the audit found no authoritative evidence anywhere in the repository for what such a mapping should be. Any inference would have been a fabricated link, which the task explicitly prohibits. Existing rows remain unmapped; a future, explicit, evidenced action would be required to map them, not this migration.

### Decision 2 — RLS

**No fake or unsafe district-scoped PostgreSQL RLS was implemented.** The audit (Section H) found the current `PrismaService` connection design (one long-lived client, no `SET LOCAL`/transaction-scoped pattern anywhere in this codebase) cannot safely support v0.2's `current_setting('app.district_scope')` pattern under connection pooling — a stale or wrong district scope could silently leak across requests if attempted naively.

`backend/migrations/0005_staff.sql` enables `ENABLE ROW LEVEL SECURITY` on both new tables with **deliberately no permissive policies attached** — the exact same defense-in-depth pattern already used for every Node-owned table since S2 (documented in each migration file: the service-role connection bypasses RLS regardless, so this changes nothing about how the app functions; it only ensures a client-side key would default-deny, not default-allow).

**All authorization for this slice is implemented at the application layer**, entirely in `console.service.ts`:
- Authentication: `StaffAuthGuard` (verifies the staff session token).
- Staff role check: `ConsoleService.assertConsoleRole`.
- District-scope check: a plain Prisma `where: { user: { locationDistrict: { in: staff.districtScope } } }` filter, or a post-fetch `staff.districtScope.includes(user.locationDistrict)` comparison.
- Case-ownership check: a plain `case.assignedCounsellorId === staff.counsellorId` comparison.

None of this is claimed to be PostgreSQL RLS, and no code path claims district isolation is enforced by the database. Real RLS remains an explicit, documented dependency for a later milestone (see "Known limitations and deferred items").

---

## Schema changes

One new additive migration: `backend/migrations/0005_staff.sql`. Does not alter, rename, or drop any existing column or table. Produced and modeled the same way as every prior slice — real introspection (a fourth throwaway-Postgres pass, `backend/schema.sql` + migrations `0002`–`0005` applied, then `prisma db pull`), not assumed from the SQL file alone. Real CRUD (including the bridge — creating a `Staff` row linking a real `User` and a real `Counsellor`, and a `StaffAuditLog` row) was smoke-tested against a live Postgres instance before the throwaway cluster was torn down.

**`staff`**: `id, user_id (UNIQUE, -> users.id), counsellor_id (nullable, -> counsellors.id), role (TEXT), org_id (nullable TEXT), district_scope (TEXT[]), languages (TEXT[]), caseload_cap (nullable INT), on_call_schedule (nullable JSONB), created_at`.

**`staff_audit_log`**: `id, staff_id (-> staff.id), action (TEXT), resource_type (TEXT), resource_id (nullable UUID), reason (nullable TEXT, always NULL in this slice), created_at`. Deliberately does **not** include `prev_hash`/`hash` — see "Audit-hook boundary" below.

Prisma additions: `Staff`, `StaffAuditLog` models, plus reverse relations `User.staff`, `Counsellor.staff` (Prisma requires both sides of a relation declared once both models exist in the schema — does not change any column on either table).

---

## Staff identity mapping

| v0.2 `staff` column | This slice's implementation | Status |
|---|---|---|
| `id` | `staff.id`, a genuine new identity distinct from both `users.id` and `counsellors.id` | **Resolved** |
| `org_id` | `staff.org_id`, nullable TEXT placeholder — no `orgs` concept exists yet in this codebase, so nothing populates it | **Structurally present, semantically deferred** |
| `role` | `staff.role`, free TEXT, validated against `STAFF_ROLES` (`counsellor`, `supervisor`, `district_admin`, `state_admin`, `national_admin`) | **Resolved** |
| `district_scope (text[])` | `staff.district_scope`, a real array column | **Resolved** |
| `languages` | `staff.languages` | **Resolved** |
| `caseload_cap` | `staff.caseload_cap`, nullable, deliberately independent of `counsellors.caseload_cap` (S5's assignment-algorithm cap is untouched) | **Resolved** |
| `on_call_schedule` | `staff.on_call_schedule`, nullable JSONB placeholder, unpopulated | **Structurally present, semantically deferred** |

`StaffService.createStaff` is the only writer. It requires an existing `userId` and, optionally, an existing `counsellorId` — both are real foreign keys, so a nonexistent id fails the insert rather than silently succeeding. `staff.user_id` is `UNIQUE` at the database level — proven with a real Postgres constraint violation in the integration suite (a second `createStaff` call for the same `userId` is rejected), not merely assumed from application-layer discipline.

**No public HTTP endpoint creates a staff row in this slice.** `StaffService.createStaff` exists for tests and as the building block a future provisioning flow would use — see "Known limitations."

---

## Authorization model

`StaffAuthGuard` (mirrors S4's `VictimAuthGuard` pattern exactly):

1. Extracts the bearer token (`extractBearerToken`, shared with the victim-auth path).
2. `StaffTokenService.getCurrentStaffSession(token)` verifies signature, purpose (`staff_session`, a separate JWT purpose and a separate secret — `STAFF_SESSION_SECRET` — from the victim session, so a victim token can never be replayed as a staff session or vice versa), and expiry. This yields **only** the authenticated `userId` — no role, no district scope.
3. `StaffService.getStaffForUser(userId)` resolves the **current** staff row fresh from the database, on **every single request**. Per the explicit instruction to "treat database state as the authority for current role/scope rather than trusting stale client claims," a role change or a staff account's removal takes effect on the very next request, not at next token expiry — proven in the integration suite (a token minted before a staff row is deleted is rejected on the next call, even though the token itself is still validly signed and unexpired).
4. No staff row → `ForbiddenException` (403): authenticated, but not staff. Matches `backend/api/auth/dependencies.py`'s own 401-vs-403 convention exactly.

`ConsoleService` then applies, per request:

- **Role gate**: only `counsellor`, `supervisor`, `district_admin` may call these endpoints at all. `state_admin`/`national_admin` are deliberately excluded — v0.2 §15's own access table says District oversight sees "Aggregates... Cannot see: Any individual record," and these two endpoints are individual-record endpoints.
- **`counsellor` role**: access is governed **only** by `case.assignedCounsellorId === staff.counsellorId` (via the bridge). A `counsellor`-role staff member with no linked `counsellorId` is denied everything — fail closed, not shown a silently-empty queue that could be mistaken for "genuinely zero cases."
- **`supervisor`/`district_admin` roles**: access is governed by `user.locationDistrict` membership in `staff.districtScope`. An empty `districtScope` authorizes nothing (fail closed), not "no restriction."

### Endpoint contract

| Method | Path | Authorization |
|---|---|---|
| `GET` | `/v1/console/queue` | Staff session required. `counsellor`: cases assigned to the linked counsellor. `supervisor`/`district_admin`: cases whose victim's district is in scope. Sorted by distress score descending (adapted from v0.2's priority/SLA-sorted queue, since no `tasks`/SLA domain exists yet — documented substitution, not a silent one). |
| `GET` | `/v1/console/victims/:id` | Staff session required. Same role/ownership rules as above, applied to one victim. A nonexistent victim id and an out-of-scope victim id produce the **identical** 403 response — no existence-leaking distinction. `:id` is validated as a UUID (`ParseUUIDPipe`) before any query runs. |

No assessment-review, referral-approval, triage, or task-mutation endpoint exists — those need domains (`assessments`, `referrals`, `tasks`) this slice does not create, per the explicit scope boundary. Mounted at `/v1/console` — v0.2's own convention (§14); no FastAPI equivalent exists to mirror, unlike S4/S5's `/api/v1/auth/*` paths.

### Staff session issuance — a deliberate, documented gap

**No public HTTP endpoint issues a staff session token in this slice.** `StaffTokenService.issueStaffSessionToken` is a proven, tested primitive (unit-tested in isolation, exercised via real HTTP responses in the integration suite) with no login route wired to it yet. This mirrors S4's own sequencing: the token mechanism was built and proven correct before any real client/login path used it.

This was a deliberate scope decision, not an oversight, for three reasons:
1. The audit (Section C/H) found Supabase Auth's `auth.uid()` alignment with this app's real data is already broken for staff — building a new Node login path on top of the same mechanism would inherit the same problem.
2. The task's own "CONSOLE API" section names exactly two GET endpoints; a login/session-exchange endpoint is not among them.
3. Tests obtain a token by calling `StaffTokenService.issueStaffSessionToken` directly via the DI container — the same "reach into the container" pattern S5's own rollback test already established in this codebase (`app.get(AssignmentService)`) — so the authorization logic this slice is actually about is fully provable without a login endpoint existing yet.

How staff will actually authenticate to Node is an explicit open question for a future slice. Two options were identified, neither implemented here: (a) a token-exchange endpoint that verifies a staff member's existing, real Supabase Auth `access_token` (the same one `backend/api/auth/dependencies.py::get_current_staff_user` already verifies) and mints a Node staff session in return, requiring no change to how staff log in today; or (b) a Node-native login path independent of Supabase Auth, mirroring how S2/S4 moved victim authentication off Supabase Auth entirely. This document does not choose between them.

---

## RLS deferral — security architecture dependency, not completed RLS

Real Postgres RLS with `app.district_scope` is **explicitly deferred**, not implemented, not faked. The dependency this defers on: a connection-handling pattern where district-scoped queries run inside an explicit transaction that also issues `SET LOCAL app.district_scope = ...` on the exact same connection, acquired and released atomically for that one transaction (Prisma's `$transaction` can do this; nothing in this codebase does it yet). Until that pattern exists, setting the session variable at all would be unsafe under Prisma's connection pooling (and doubly so if Supabase's pgbouncer sits in transaction-pooling mode) — a stale value could silently leak across unrelated requests. This slice does not attempt it. District isolation for this slice's two endpoints is real and tested, but it is enforced entirely by Node application code, not by the database.

---

## Audit-hook boundary

`StaffAuditService` (the **only** writer of `staff_audit_log`) records exactly two action codes — `console.queue.read`, `console.victim.read` — plus `resourceType` (`queue`/`victim`) and, for victim reads, the victim's `users.id` as `resourceId`. Its method signature has no parameter through which victim transcript text, a token, a PIN, or any other secret could ever be passed — this is a structural guarantee, not a convention, verified by a unit test that seeds a victim with a name containing an obvious marker string and asserts the resulting audit row (serialized) never contains it.

Only **successful** reads are recorded, matching v0.2 §15's own phrasing ("every READ of victim content is logged"); a denied attempt is not recorded in this slice (proven by a test asserting zero audit rows after a 403). `reason` exists as a column (matching v0.2 §12) but is always `NULL` — no break-glass flow writes to it yet.

This is explicitly **not** v0.2's full hash-chained/write-once-read-many audit subsystem — no `prev_hash`/`hash` columns exist. Adding empty or placeholder hash columns would itself have been a false claim of tamper-evidence that doesn't exist, which is why they were omitted entirely rather than stubbed.

---

## Security tests (all 12 required scenarios, all passing against real Postgres)

`apps/core-api/test/staff-console.integration-spec.ts`, 20 tests:

1. **Unauthenticated request → denied**: no `Authorization` header on either endpoint → 401.
2. **Invalid/expired token → denied**: malformed header → 401; garbage token → 401. (Expired-token decoding is additionally unit-tested in `staff-token.service.spec.ts`, mirroring how S4 split this coverage between unit and integration levels.)
3. **Victim token cannot call staff endpoints**: a real `victim_session` token from the actual OTP+register HTTP flow is rejected (401) by both console endpoints — proven with a genuine token, not a hand-crafted one.
4. **Staff cannot access victim outside district**: `district_admin` scoped to `['Pune']` denied (403) a victim in `Mumbai`.
5. **Staff cannot access victim/case outside assignment where role requires it**: `counsellor` denied (403) a case assigned to a different counsellor; denied everything if unlinked (`counsellorId: null`).
6. **Client cannot override district**: a query string naming the victim's real district (`?district=Mumbai&districtScope=Mumbai`) has zero effect — the endpoint reads no such parameter.
7. **Client cannot override staff identity**: a request body claiming a different `staffId`/`role` produces a byte-for-byte identical response to the same request without that body — proven by comparing both, not by asserting an unverifiable fixed expectation.
8. **Unrelated `users.id`/`counsellors.id` cannot accidentally authorize access**: a `counsellors` row is deliberately created with an `id` equal to a staff member's own `users.id` (real Postgres, forced coincidence) — access is still denied, because the code only ever reads `staff.counsellorId`.
9. **No sensitive token/PIN/secret logging**: every `Logger` method is spied across a full authenticate-and-query HTTP flow; the raw token value never appears in any logged text.
10. **Staff identity mapping is unique and deterministic**: a real `UNIQUE` constraint violation when a second `staff` row is attempted for the same `userId`; two lookups for the same `userId` return the same `staff.id`.
11. **Supervisor/district-admin behavior is explicit and tested**: `supervisor` sees every district case with no per-case assignment requirement (distinct from `counsellor`); both roles' empty-scope behavior is tested separately.
12. **No authorization relies on frontend role routing**: every test above calls the Node HTTP API directly with `supertest` — there is no frontend in the request path at all, so this property holds by construction, not by a specific assertion.

`apps/core-api/src/staff/*.spec.ts` and `apps/core-api/src/console/console.service.spec.ts` (34 additional unit tests) cover the same properties at the service/guard level with an in-memory fake, including a stronger, pinpointed version of item 8 (`staff.userId` deliberately set equal to a case's `assignedCounsellorId` string) and item 10's role-change-takes-effect-immediately property.

---

## FastAPI coexistence

**FastAPI remains the sole live authority.** No FastAPI file was modified — `backend/api/auth/dependencies.py`, `auth_routes.py`, and every `backend/api/dashboards/*.py` route are byte-for-byte unchanged. No dual write was introduced: `staff` and `staff_audit_log` are new tables with no FastAPI equivalent, so there is no existing FastAPI write path that could race with Node's. No existing client (web frontend, mobile app) was modified, and none calls any endpoint this slice added — `/v1/console/*` is unreachable from any real client today. The React `console` app (v0.2 repository layout §16) was not created or migrated.

---

## Known limitations and deferred items

- **No staff login/session-issuance HTTP endpoint** — see "Staff session issuance" above. This is the most consequential open item: nothing in this slice, by itself, lets a real person become an authenticated Node staff session holder.
- **`org_id`/`on_call_schedule` are structurally present, semantically empty** — no product concept of "org" or on-call scheduling exists yet; nothing populates these columns.
- **Real PostgreSQL RLS remains deferred**, pending the connection/transaction-scoping decision described above.
- **Break-glass access, the full hash-chained audit log, assessment review, referral approval, and any task/SLA-shaped queue behavior are not implemented** — explicitly out of this slice's scope.
- **Existing `users`/`counsellors` rows are not mapped to any `staff` row** — the migration creates the table empty, and no inference was made (Decision 1). A future, evidenced provisioning step is required before any real staff member can use this slice's endpoints.
- **The frontend role-routing bug found during the audit** (`admin_district` vs. the real `district_admin`) was left as found — out of scope for a backend authorization foundation slice, and no frontend file was touched.
- **`GET /v1/console/queue`'s sort key (distress score) is a documented substitution** for v0.2's priority/SLA-based ordering, since no `tasks`/SLA domain exists yet.

---

## Cutover requirements (for a future slice, not decided here)

Before any real client is pointed at `/v1/console/*`: (1) a real staff session issuance path must exist (see the two options above); (2) at least one real `staff` row must exist, mapped to a real `users` row via an evidenced, explicit provisioning action — not inferred; (3) if per-case assignment access is needed for existing counsellors, their `counsellors` rows must be explicitly, evidently linked via `staff.counsellor_id` — not guessed; (4) real RLS's connection-scoping prerequisite (above) should be resolved before any endpoint here is treated as the primary defense against cross-district access, since today that defense is Node application code alone, with no database-level backstop.
