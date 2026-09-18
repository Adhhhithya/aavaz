# S7_STAFF_CONSOLE_AUDIT.md

**READ-ONLY pre-implementation audit.** No application code, schema, or
migration was modified to produce this document. This document itself is
the only file change made while performing this audit. All findings below
were verified by reading the actual repository at
`HEAD 87a57766c11ccca3f1ef53284c93a26291fa36f3` and by re-running the
existing test suites (89 Python, 73 Node unit — both passed, unchanged)
before writing anything.

Purpose: determine the exact safe boundary for the proposed S7 slice
("Staff + Console Authorization Foundation") before any implementation
begins. Builds on `docs/S4_IDENTITY_MIGRATION.md`,
`docs/S5_REGISTRATION_MIGRATION.md`, `docs/S6_ONBOARDING_MIGRATION.md`, and
`docs/AAVAZ_MIGRATION_PLAN.md`.

---

## A. Current architecture

Unchanged high-level shape from S4–S6: a FastAPI monolith (`backend/`)
remains the sole **live** authority for every endpoint, including every
staff-facing one. A Node/NestJS `core-api` (`apps/core-api/`) has
progressively taken ownership of **victim-facing** domain writes only:
identity/OTP (S4), registration/case-creation/counsellor-assignment (S5),
and consent/profile/safety-settings (S6). **Node currently owns zero
staff-facing or console-facing capability.** There is no staff
authentication, no role concept, no district-scoping, and no console
endpoint anywhere in `apps/core-api/src`— confirmed by a repository-wide
search (only false-positive matches on the unrelated word "district" inside
victim location/case-assignment code).

Database: a single Supabase/Postgres instance. `backend/schema.sql` plus
`backend/migrations/0002_otp_codes.sql`, `0003_counsellor_caseload_cap.sql`,
`0004_consent_profile_safety.sql` (there is no `0001` file — `schema.sql`
itself is the un-numbered base, not a numbered migration) are the additive
migration history so far. Node reads/writes seven tables today (`users`,
`otp_codes`, `cases`, `counsellors`, `consents`, `victim_profiles`,
`safety_settings`), all via real, previously-run Prisma introspection
(documented in each prior milestone's own doc) — never assumed from
`schema.sql` alone.

---

## B. Existing staff/counsellor model

There are **two structurally separate, entirely unlinked concepts** in this
codebase that both get called "counsellor" in casual language, and neither
alone matches v0.2's `staff` table:

1. **`users` rows with a staff-shaped `role_type`** (`counsellor`,
   `district_admin`, `state_admin`, `national_admin`, `super_admin`) — this
   is the **identity/authentication** side. It is how a person logs in and
   is granted a role (`backend/api/auth/dependencies.py`).
2. **The `counsellors` table** (`id, name, district, languages,
   current_caseload, caseload_cap`) — this is a pure **assignment-target**
   record used only by `backend/api/assignment/auto_assign.py` (Python) and
   `apps/core-api/src/cases/assignment.service.ts` (Node, S5). It has **no
   login capability, no role field, no org_id, no on-call schedule, and no
   foreign key or any other link to a `users` row.**

Verified by direct search: nothing in the entire repository (Python,
Node, or seed scripts) ever creates a `counsellors` row whose `id` matches
any `users` row, or vice versa. `backend/scripts/seed_data.py` inserts a
`counsellors` row with a standalone hardcoded UUID
(`11111111-1111-1111-1111-111111111111`); `scripts/create_staff.py` inserts
`users` rows with a different set of standalone hardcoded UUIDs
(`10000000-...-0001` through `...-0005`). These are two disjoint identity
spaces today.

**Consequence for `counsellor_routes.py`'s own ownership check**
(`current_user.id != counsellor_id` in `get_counsellor_queue`, and
`case_data.get("assigned_counsellor_id") != current_user.id` in
`get_case_detail`): both compare a **staff identity id** (`users.id` /
Supabase Auth uid) against a **`counsellors.id`** value. Since nothing links
these two id spaces, this check can only ever coincidentally succeed if a
deployment manually forces a `counsellors` row to share its UUID with a
`users` row — nothing in this codebase does that. **This is a real,
pre-existing functional gap in the "ownership enforcement," not merely a
naming inconvenience** — see Section I.

**Answer to the task's question 3**: the existing `counsellors` table
**cannot alone represent v0.2's `staff` responsibility**, because it has no
identity/authentication capability at all — it is not a competing model,
it is a *different, narrower* model (assignment target only). Equally, the
existing `users`-with-staff-`role_type` mechanism cannot alone represent it
either, because it has no district-scope array, no caseload cap, no
languages, and no org_id. **Neither existing table is v0.2's `staff` table.**
Per the explicit instruction not to invent a second competing identity
model merely because v0.2 uses the word "staff," the two existing pieces
should most likely be **linked** (e.g. a `user_id` foreign key on
`counsellors` pointing at the staff's `users` row, or the reverse) rather
than a third, independent `staff` table being introduced that duplicates
either. This is a design decision for the S7 implementation slice itself,
not resolved here — this audit surfaces the exact shape of the gap, not the
final schema.

---

## C. Existing staff auth

`backend/api/auth/auth_routes.py::login` — real Supabase Auth
(`supabase.auth.sign_in_with_password`), **not** a mock. On success it looks
up the matching `users` row **by id** (`auth.uid()`) to resolve `role_type`
and `name`.

`backend/api/auth/dependencies.py` — `get_current_staff_user`: verifies the
bearer token against Supabase Auth (`supabase.auth.get_user`), then resolves
`role_type` from the `users` table; rejects with 401 if the token itself is
invalid, 403 if the token is valid but the account's `role_type` isn't in
`STAFF_ROLES`. `require_roles(*roles)` is a dependency factory built on top
of it. This mechanism is real and is genuinely wired into every staff route
file (confirmed by `backend/tests/test_dashboard_authorization.py`, which
asserts 401 with no credentials against the real, mounted app for 11
representative endpoints).

**A confirmed, concrete data-shape problem, not a hypothetical one**: the
`role_type` values staff accounts need (`counsellor`, `district_admin`,
`state_admin`, `national_admin`, `super_admin`) are **not members of
`role_type_enum`** as that enum has been independently, really
introspected three separate times against a real Postgres instance loaded
with `schema.sql` (S4, S5, S6 — each documented in its own migration doc).
The real enum's only values are `victim`, `witness`, `family`. This means
`scripts/create_staff.py`, as written, would fail with a Postgres type
error if run against any database whose `role_type` column is genuinely
that enum type. Either the live Supabase project's `role_type` column is
NOT actually that enum (further live-schema drift beyond what's already
documented in `docs/AAVAZ_IMPLEMENTATION_AUDIT.md`), or this staff-seeding
path has never been successfully exercised against a schema.sql-conformant
database. **This is a genuine, verified INCOMPATIBLE finding** (Section G).

`scripts/create_staff.py` also never creates a corresponding Supabase Auth
user for any seeded staff row — it only inserts into `public.users`. Since
`login()` requires a real Supabase Auth account whose `id` equals the
`users.id` row, the seed script alone cannot produce a working login; a
separate, undocumented manual step would be required.

---

## D. Existing console endpoints

No endpoint anywhere in this repository is mounted at a `/v1/console/*` or
`/v1/oversight/*` path (v0.2's own naming, Section F). The closest existing
analogues, all under FastAPI's `/api/v1/dashboards/*` prefix:

| Endpoint | Role gate | District enforcement | Ownership enforcement | Notes |
|---|---|---|---|---|
| `GET /district/{district_name}/stats` | `district_admin`+ | **None** — the route's own comment admits "a district_admin here is authorized for ANY district" | N/A | Real DB query. |
| `GET /district/{district_name}/cases` | `district_admin`+ | **None**, same gap | N/A | Real DB query. |
| `GET /district/{district_name}/sos` | `district_admin`+ | **None** — returns ALL unresolved SOS events regardless of the path param; the code's own comment says "In prod: filter by district" (not done) | N/A | Real but effectively unscoped. |
| `GET /district/{district_name}/counsellors` | `district_admin`+ | **None** | N/A | Real DB query. |
| `GET /state/stats` | `state_admin`+ | N/A (mock) | N/A | **100% hardcoded mock data** — no DB query at all. |
| `GET /national/stats` | `national_admin`+ | N/A (no sub-scoping in v0.2 either) | N/A | Real DB query, applies `apply_tier_redaction`. |
| `GET /counsellor/queue/{counsellor_id}` | `counsellor`+ | N/A | **Broken** — compares `users.id` to `counsellors.id`, two unlinked id spaces (Section B) | Real DB query. |
| `GET /counsellor/case/{case_id}` | `counsellor`+ | **None** for non-counsellor roles (any district/state/national/super admin can view ANY case) | Same broken comparison for the `counsellor` role specifically | Real DB query. |
| `GET /superadmin/tables/{table_name}` / `POST` / `DELETE` | `super_admin` only | N/A | N/A | Generic table CRUD, `payload: dict` accepted verbatim on insert — real but high-risk by design; correctly restricted to the narrowest role. |
| `GET /api/v1/cases/{case_id}/progress` | staff (any role) OR the owning victim, via `get_case_access_principal` | **None** for staff | Real ownership check for the `counsellor` role specifically (same broken id-space comparison as above); no check at all for district/state/national/super_admin roles | Dual-principal endpoint; also victim-facing (S1/S2). |

**Can a staff member access another district today?** Yes — confirmed,
not assumed: nothing server-side prevents a `district_admin` token from
querying any `district_name` path value.

**Can a supervisor access the intended scope?** There is no `supervisor`
role distinct from `district_admin`/`state_admin` anywhere in this
codebase — v0.2's "Supervisor" role (Section F) does not exist as a
concept here yet.

**Do current Supabase policies actually enforce isolation?** No — see
Section H. RLS policies exist in `scripts/apply_rls.sql` but are keyed on
`auth.uid()` patterns that don't correspond to how these endpoints
actually authorize (see Section H for why), and the backend connects with
the Supabase **service-role key**, which bypasses RLS entirely regardless
(already documented generally in `docs/AAVAZ_IMPLEMENTATION_AUDIT.md`;
this audit confirms it specifically for every staff route above).

---

## E. Existing dashboard state

| Screen | State | Evidence |
|---|---|---|
| `frontend/src/pages/Admin/DistrictDashboard.jsx` | **Real but incomplete** | Uses `authFetch` (real bearer token attached), handles real 401/403 from the server, but falls back to hardcoded numbers when fields are missing (`data.totalCases \|\| 120`, `?? 5`, `?? 2`) and has no `user.district` value to send (client never receives one — see below), so it always requests `/district/unassigned/stats`. |
| `frontend/src/pages/Counsellor/Queue.jsx` | **100% mock** | A hardcoded `mockCases` array; no `authFetch`, no `fetch` call of any kind. |
| `frontend/src/pages/Counsellor/CaseDetail.jsx` | **Real, authenticated** | Uses `authFetch` against the real `/api/v1/cases/{caseId}/progress` endpoint; handles real 401/403. |
| `frontend/src/pages/Admin/NationalDashboard.jsx` | **100% mock**, despite a real backend | `setTimeout(() => setStats({...hardcoded...}), 600)` with an explicit `// Mocking the backend fetch for MVP` comment — never calls the real, DB-backed `national_routes.py::get_national_dashboard` at all. |
| `frontend/src/pages/Admin/StateDashboard.jsx` | **100% mock, both ends** | Same `setTimeout` mock pattern client-side; the backend it would call (`state_routes.py`) is *also* hardcoded mock data server-side. |

**Still calling FastAPI directly**: every real (non-mock) screen above
calls FastAPI directly via `frontend/src/context/AuthContext.jsx`'s
`authFetch` — none call any Node `core-api` endpoint, because none exist
for staff yet.

**Role-routing bug found (frontend-only, pre-existing, unrelated to S7's
own scope)**: `frontend/src/pages/Login.jsx`'s post-staff-login redirect
checks `data.user.role === 'admin_district'` / `'admin_state'` /
`'admin_national'`, but the backend's actual `role_type` values (and
`dependencies.py`'s `STAFF_ROLES` set) are `district_admin` / `state_admin`
/ `national_admin` — **reversed word order**. As written, a real
`district_admin`/`state_admin`/`national_admin` login would fall through to
`else navigate('/')` instead of reaching its dashboard. This is a
genuine, independently-discovered bug, not a hypothetical — flagged here
because any S7 console work will need to be aware this routing is already
broken today, independent of anything S7 changes.

`frontend/src/context/AuthContext.jsx`'s `login()` stores whatever object
it's given verbatim; nothing anywhere populates a `district` field on it
(confirmed: `auth_routes.py::login`'s response has no `district` key), so
`DistrictDashboard.jsx`'s own `user?.district` reference is always
`undefined` today, exactly as that file's own comment states.

---

## F. v0.2 staff requirements

From `docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf`:

- **System map (§1)**: `core-api` is "sole writer of domain tables,"
  including `staff`. The `console` app (React) is "case manager and
  supervisor web app." Python has "no direct DB role" on Node-owned tables.
- **Data model (§12)**: `staff: id, org_id, role, district_scope (text[]),
  languages, caseload_cap, on_call_schedule`. `district_scope` is
  explicitly an **array** (a staff member can cover multiple districts),
  distinct from `victims.district_code` (a single value per victim). The
  worked RLS example is `CREATE POLICY cm_scope ON victims USING
  (district_code = ANY (current_setting('app.district_scope')::text[]))` —
  i.e., `core-api` is expected to set the `app.district_scope` session
  variable per request from the authenticated staff member's own
  `district_scope` array before running district-scoped queries.
- **API surface (§14)**: `GET /v1/console/queue`, `GET
  /v1/console/victims/{id}`, `POST /v1/console/assessments/{id}/review`,
  `POST /v1/console/referrals/{id}/approve`, `GET
  /v1/oversight/districts/{code}/metrics`. All served by Node
  (`core-api`/`channel-gateway`); Python services are internal-only.
- **Access-by-role table (§15)**: Victim, **Case manager** (assigned
  victims in district scope; "victims outside scope without break-glass"
  are explicitly the *cannot-see* case), **Supervisor** (district queue,
  SLA breaches, overrides; transcripts only "with a logged reason"),
  Referral receiver, District oversight (aggregates with small-count
  suppression only), Engineer/admin (infra/metadata, never decrypted
  content).
- **Security controls (§15)**: break-glass (typed reason, 2-hour expiry,
  notifies supervisor), audit log (hash-chained, every content read
  logged), envelope encryption per victim.
- **Event catalog (§13)**: no event is specific to staff/console actions
  authorizing themselves — `task.created/.breached` and
  `referral.state_changed` are consumed by `console`/`oversight`, not
  produced by a staff-auth action.

No requirement is invented beyond what the spec states; nowhere does v0.2
specify exact `role` enum values, an exact break-glass UI, or exact
audit-log schema beyond the §12 columns already quoted.

---

## G. Gap matrix — existing data vs. v0.2 `staff` requirements

| v0.2 `staff` column | Existing equivalent | Status |
|---|---|---|
| `id` | `users.id` (staff-role rows) **or** `counsellors.id` — two disjoint candidates, neither is "the" staff id today | **PARTIAL** |
| `org_id` | Nothing anywhere | **MISSING** |
| `role` | `users.role_type`, but populated with values (`counsellor`, `district_admin`, ...) that are **not members of the real, introspected `role_type_enum`** (`victim`/`witness`/`family`) | **INCOMPATIBLE** |
| `district_scope (text[])` | Nothing — `counsellors.district` is a **single** string, not an array, and lives on a table unlinked to staff identity; no per-admin district field exists on `users` at all (confirmed by the codebase's own comments in `district_routes.py` and `DistrictDashboard.jsx`) | **MISSING** (and the closest analogue is the wrong shape — single value, not array) |
| `languages` | `counsellors.languages` (`text[]`) exists, but again on the unlinked assignment-target table, not on any staff-identity row | **PARTIAL** |
| `caseload_cap` | `counsellors.caseload_cap` exists (added S5, real column, `NOT NULL DEFAULT 80`) — same caveat, lives on the unlinked table | **PARTIAL** |
| `on_call_schedule` | Nothing anywhere | **MISSING** |

**Overall**: no single existing table is PRESENT for v0.2's `staff` model.
The closest real data (`languages`, `caseload_cap`) already lives in
`counsellors` (Node-owned since S5) but is disconnected from the
authenticatable identity (`users.role_type`, still FastAPI/Supabase-Auth-
owned). `role` itself is actively incompatible with the real enum. `org_id`
and `on_call_schedule` don't exist in any form.

---

## H. RLS / district-scoping analysis

**Existing policies** (`scripts/apply_rls.sql`) key entirely on
`auth.uid() = <column>` and `auth.jwt() ->> 'role_type'`. Two independent
problems make these **not currently enforcing anything for the actual
authorization flows in this codebase**, verified rather than assumed:

1. **The backend always connects via the Supabase service-role key**
   (`backend/services/supabase_client.py`, unchanged since the original
   audit) — this bypasses RLS entirely for every query FastAPI or Node
   issues, regardless of what the policies say. This was already the
   headline finding of `docs/AAVAZ_IMPLEMENTATION_AUDIT.md` and remains
   true for every table touched through S6.
2. **Even if RLS were enforced, the policies wouldn't match reality for
   victims**: `CREATE POLICY "Users can view own profile" ... USING
   (auth.uid() = id)` assumes a victim has a Supabase Auth session whose
   `auth.uid()` equals their `users.id`. Victims never get a Supabase Auth
   session anywhere in this codebase (S2/S4 authentication is phone+OTP,
   issuing Node/FastAPI-signed JWTs, never a `supabase.auth.sign_up`/
   `sign_in` call for a victim). So `auth.uid()` would be `NULL` for every
   victim request that somehow *did* reach Postgres with a non-service-role
   credential — these policies could never actually pass for a victim.
   Staff `auth.uid() = assigned_counsellor_id` policies inherit the exact
   same Section B id-space mismatch (`assigned_counsellor_id` references
   `counsellors.id`, not `users.id`/`auth.uid()`).

**This is not v0.2's district-scoped RLS model at all** — there is no
`district_code` column on any table today (not `users`, not `cases`), no
`app.district_scope` session variable is ever set anywhere in this
codebase (Python or Node), and no policy resembling v0.2's worked example
(`district_code = ANY (current_setting('app.district_scope')::text[])`)
exists.

**Which tables would need district-scoped policies** (per v0.2 §12, "all
victim-linked tables carry district_code"): `users` (as the physical
`victims` table), `cases`, `consents`, `victim_profiles`,
`safety_settings` — i.e., every table Node has owned since S4–S6. None of
them currently has a `district_code` column; the closest is
`users.location_district`, which is (a) mock-resolved data (S5's
`LocationService`, ported 1:1 from the Python mock geocoder) and (b) not
propagated onto `cases`/`consents`/`victim_profiles`/`safety_settings` at
all today.

**Which tables would need victim-ownership policies**: the same five —
already enforced today, but at the **application layer** (Node's
`VictimAuthGuard` + querying by the authenticated victim's own id, S4–S6),
not via Postgres RLS. This is explicitly documented as a known,
deliberate gap in `docs/S6_ONBOARDING_MIGRATION.md` Phase 7 — this audit
confirms nothing has changed.

**Can the current Supabase setup coexist with Node/Prisma?** Yes, at the
connection level — this is already happening (S4–S6 point Prisma at the
same Postgres instance FastAPI uses, via a plain connection string, not a
Supabase client library). The open question is not "can they coexist" but
"can they coexist **safely** once RLS is meant to actually do something" —
see the pooling concern next.

**Pooling/session-scoped `app.district_scope` concern (verified, not
assumed)**: `apps/core-api/src/prisma/prisma.service.ts` constructs a
single, long-lived `PrismaClient` for the whole Node process (confirmed by
reading the file — no per-request client construction, no
`SET LOCAL`/transaction-scoped variable-setting anywhere in the codebase
today). Postgres session variables set via `SET app.district_scope = ...`
are connection-scoped. If Prisma's underlying connection pool hands out a
pooled connection to a different request between the `SET` and the actual
query (which Prisma's default pool absolutely can do under concurrent
load, and Supabase's own pgbouncer layer — if used in transaction-pooling
mode — makes this even more likely, since pgbouncer can reuse a physical
connection for entirely unrelated client sessions between transactions),
**a stale or wrong `app.district_scope` value could silently leak across
requests.** The only safe pattern is `SET LOCAL` inside an explicit
transaction that also runs the district-scoped query, committed/rolled
back together, using a connection acquired and released atomically for
that one transaction — Prisma supports this via `$transaction`, but
**nothing in the codebase does this today**, because nothing sets
`app.district_scope` at all yet. This is a real implementation constraint
S7 (or whichever slice first sets this variable) must design around, not
a hypothetical.

**No RLS, district isolation, or staff-security claim is made anywhere in
this document as already existing** — per instruction 13, every claim
above is traceable to a specific file/line already quoted.

---

## I. Authorization threat model

Concrete, verified attack/gap scenarios against the **current**
implementation (not S7's future one):

1. **Cross-district read**: any authenticated `district_admin` (or higher)
   token can read any other district's stats/cases/sos/counsellors by
   changing the URL path segment. No server-side check exists. (Section D)
2. **Cross-case read for non-counsellor staff**: any `district_admin`/
   `state_admin`/`national_admin`/`super_admin` token can read the full
   detail (including transcribed interactions and PII) of **any** case via
   `GET /counsellor/case/{case_id}` or `GET /cases/{case_id}/progress` —
   there is no ownership or scope check for those roles, only for the
   `counsellor` role specifically. (Section D)
3. **Broken counsellor ownership check**: the one ownership check that does
   exist (`counsellor` role vs. `assigned_counsellor_id`) compares two
   unlinked id spaces (Section B) — in practice this likely either always
   fails (denying legitimate counsellors) or is silently bypassable
   depending on how/whether any deployment has manually aligned the ids,
   which nothing in the codebase guarantees.
4. **`role_type` values incompatible with the introspected enum**
   (Section C/G) — a real risk that staff-role provisioning has either
   never worked end-to-end against a schema.sql-conformant database, or
   that the live database has silently drifted from `schema.sql` in a way
   not yet reconciled.
5. **Frontend role-routing bug** (Section E) sends real
   district/state/national admins to the homepage instead of their
   dashboard — a functional bug, not a security hole (the backend still
   gates the actual data), but relevant to any S7 UI decisions.
6. **RLS is not a real defense today** for any table (Section H) — the
   entire authorization surface for staff currently rests on FastAPI's
   application-layer `require_roles` checks alone. That mechanism is real
   and tested (Section C), but it is the *only* layer, with no
   defense-in-depth from the database.
7. **No victim id / user id is ever accepted from a client as
   authoritative** on any staff-facing read path — every endpoint resolves
   the *caller's* identity from a server-verified token; the `district_name`
   and `case_id`/`counsellor_id` **path parameters** are the actual
   unauthenticated input (not the caller's identity, but the *scope of
   data requested*), which is exactly where findings 1–3 above originate.
   This distinction matters for the gap matrix: the vulnerability class is
   "insufficient scope-of-request enforcement," not "trusted client
   identity," and S7's fix must be a district/ownership check, not another
   token check.

---

## J. S7 proposed scope

Framed as what the **dependency structure** (not convenience) actually
allows to be built safely now, given everything above:

**In scope, buildable now, no blockers**:
- A Node-owned `staff` identity concept, linked to (not duplicating) the
  existing `counsellors` assignment-target table — e.g. `counsellors`
  gains a nullable `userId` FK to `users`, or a genuinely new minimal
  `staff` table is introduced that both `counsellors`-style assignment
  data and a `users` row can reference. (This audit intentionally does not
  pick one — see Section B.)
- A Node-issued staff session token (mirroring S4's `TokenService`
  pattern: a third token purpose alongside `phone_verified`/`victim`),
  **decoupled from Supabase Auth** — since Supabase Auth already has the
  demonstrated `auth.uid()`-alignment problems in Section C/H, and Node
  already owns real, tested JWT issuance for victims.
- Server-side, application-layer district-scope enforcement (checking the
  authenticated staff's `district_scope` against the requested resource's
  district in Node code) — this does **not** require solving the RLS
  session-variable/pooling problem (Section H) at all; it is a plain query
  filter, the same pattern S4–S6 already use for victim ownership.
- Minimal audit-hook groundwork (Section below) — an additive `audit_log`-
  shaped table and a call-site convention, without the full v0.2 audit
  subsystem (hash-chaining, daily write-once export).

**Explicitly NOT safe to build now without first resolving a named
blocker** (see Section O): real Postgres RLS with `app.district_scope`
(the connection-pooling hazard in Section H is unresolved and this audit
was instructed not to fake it); a `staff` table shape final enough to
close the `org_id`/`on_call_schedule` gaps (no product decision exists
yet on what an "org" is in this codebase); anything that touches or
replaces the Supabase-Auth-based staff login (`auth_routes.py::login`) —
that is a coexistence/cutover decision, not an extraction one, same as
every prior slice's treatment of FastAPI.

---

## K. Explicit out-of-scope items

Per the task's STOP condition, and consistent with it: scheduling,
baseline check-in, silence ladder, `agent-svc`, `memory-svc`,
`analysis-svc`, `speech-svc`, referrals, `channel-gateway`, full console
migration (the React `console` app), Temporal, production deployment. Also
out of scope for S7 specifically, based on this audit's findings: real
Postgres RLS/`app.district_scope` (Section H/O), break-glass access
(depends on the audit-log foundation existing first), the full hash-chained
audit log, any change to the Supabase-Auth staff login path itself, and
fixing the Section E frontend routing bug (frontend changes are out of
scope for an audit and arguably out of scope for a backend-authorization
foundation slice regardless).

---

## L. Dependencies on S1–S6

- **S4 (`TokenService`, `VictimAuthGuard` pattern)**: S7's staff token
  issuance and `StaffAuthGuard` would directly reuse this module's
  established pattern (per-call secret resolution, dev-fallback-or-throw)
  — no conflict, a natural extension.
- **S5 (`Counsellor`/`Case` Prisma models, `AssignmentService`)**: S7 must
  not duplicate `counsellors` — Section B's linkage decision is the
  concrete dependency. `AssignmentService`'s existing per-row
  `caseloadCap` logic is unaffected either way.
2 **S6 (`VictimAuthGuard` export from `IdentityModule`)**: establishes the
  exact reusable-guard-via-module-import pattern S7's `StaffAuthGuard`
  would also want to be reusable by (a hypothetical future `console`
  module), consistent with S6's own precedent.
- **No conflict found** with any S1–S6 committed work — nothing in S7's
  likely scope requires modifying `apps/core-api/src/identity/`,
  `cases/`, `consent/`, `profile/`, or `safety/`'s existing behavior; it is
  additive (new module(s) + new/linked tables), matching the same pattern
  every prior slice has followed.

---

## M. Dependencies for S8+

- The real v0.2 `console` React app (repository layout §16) depends on S7
  existing first (it needs a staff auth/session mechanism to call against).
- Referrals (`POST /v1/console/referrals/{id}/approve`) and the assessment-
  review endpoint depend on `assessments`/`referrals` tables that don't
  exist yet (Python-side `analysis-svc` work, not started).
- Break-glass access and the full audit log depend on S7's minimal
  audit-hook groundwork (Section below) being in place first.
- Real district-scoped RLS depends on resolving the connection-
  pooling/session-variable hazard (Section H) — likely requires either a
  dedicated short-lived connection-per-request pattern for district-scoped
  queries, or moving those specific queries to raw SQL with an explicit
  transaction, neither of which is decided here.

---

## N. Recommended implementation sequence (if S7 proceeds)

1. Resolve the Section B linkage decision (schema design, additive
   migration) before writing any Node authorization code against it.
2. Add the linked staff-identity data + a Node staff session token
   (S4-pattern), authenticating independently of Supabase Auth.
3. Add application-layer district-scope + case-ownership enforcement using
   that token — the plain-query-filter pattern, not RLS.
4. Add the minimal audit-hook table + call sites for staff data access.
5. Add the first real `GET /v1/console/queue`-shaped Node endpoint(s) as
   proof the whole chain works, with tests proving cross-district and
   cross-case-ownership denial (mirroring this audit's Section I threat
   scenarios as regression tests).
6. Leave FastAPI's existing staff routes untouched and live, exactly as
   S4–S6 left every prior domain's FastAPI equivalent untouched.

---

## O. Risks / blockers

- **Blocker (design decision required, not merely implementation)**:
  Section B's staff/counsellor linkage shape is not decided. Implementation
  should not start until this is settled, or S7 risks creating exactly the
  "second competing identity model" the task explicitly warns against.
- **Blocker (unresolved technical hazard)**: the RLS/pooling concern
  (Section H) means district-scoped RLS cannot be safely implemented in
  this slice without a specific connection-handling pattern decision that
  doesn't exist yet. Recommendation: S7 implements district-scoping at the
  application layer only (already proven safe by S4–S6's identical
  approach to victim ownership) and explicitly defers real RLS.
- **Risk, not a blocker**: the `role_type` enum incompatibility
  (Section C/G) means any new staff-role data S7 writes must not reuse
  `users.role_type` for new role values without first confirming (via
  fresh introspection, same discipline as S4–S6) what the *live* enum
  actually accepts — or storing `role` on a new table with its own,
  compatible type, sidestepping the existing enum entirely.
- **Risk, not a blocker**: Supabase Auth's demonstrated non-alignment with
  this app's actual authentication model (Section C/H) means continuing to
  build staff auth on top of it would inherit the same problems S2/S4
  already moved away from for victims. Recommendation in Section J is to
  issue Node-signed staff tokens instead, independent of Supabase Auth —
  but this is itself a design decision, flagged here, not made here.

---

## P. Exact files S7 would likely modify or create

Based on the precedent set by S4–S6 and the gaps found above — **not**
created or modified by this audit, listed for planning only:

- `backend/migrations/0005_staff_*.sql` (new, additive — exact name/shape
  depends on the Section B decision)
- `apps/core-api/prisma/schema.prisma` (extend — new/linked staff model)
- `apps/core-api/src/staff/` (new module: `staff.module.ts`,
  `staff-auth.guard.ts`, `staff.decorators.ts`, a staff-session addition to
  `token.service.ts` or a parallel service, DTOs)
- `apps/core-api/src/config/configuration.ts` (a staff-session-secret
  config value, S4-pattern)
- `apps/core-api/src/app.module.ts` (wire the new module in)
- `apps/core-api/test/pg-harness.ts` callers — a new integration spec file
  (e.g. `test/staff-console.integration-spec.ts`)
- `docs/S7_STAFF_CONSOLE_MIGRATION.md` (the implementation-phase doc,
  distinct from this audit)
- **Not** `backend/api/auth/*.py`, **not** any FastAPI dashboard route file
  — per Phase 9's "do not delete FastAPI" precedent and this task's own
  "do not remove FastAPI functionality yet," none of S1–S6 has ever
  modified existing FastAPI files, and S7 has no stated reason to be the
  first exception.
- **Not** any frontend/mobile file — no client cutover is implied by this
  audit.

---

## Q. Tests that must exist before S7 can be considered complete

Mirroring the discipline already established in S4–S6 (unit + real-Postgres
integration, preserving all existing tests):

- Staff session issuance/verification (S4-pattern unit tests: valid token
  resolves correctly, wrong-purpose token rejected, expired token rejected,
  garbage token rejected, no-secret-outside-development throws).
- District-scope enforcement: a staff member with district scope `[A]`
  can read district `A` data and is rejected (403, not merely filtered
  silently) for district `B` — directly regression-testing Section I
  finding 1.
- Case-ownership enforcement: a counsellor/case-manager can only read
  cases actually linked to their staff identity (once Section B's linkage
  exists) — directly regression-testing Section I findings 2–3.
- A structural test proving the new staff-identity linkage is real (e.g.
  asserting a created staff row's assignment-relevant fields are reachable
  through one consistent id), the same style of test S5/S6 already use to
  prove "no second identity record" (`identity.service.spec.ts`'s
  `cases` non-existence check; S6's cross-victim isolation tests).
- Integration tests against a real disposable Postgres
  (`test/pg-harness.ts`) proving the new migration applies cleanly and
  additively (no `DROP`/`TRUNCATE`, same automated check pattern S6
  introduced).
- Full regression: all 89 existing Python tests and all currently-passing
  Node unit/integration tests must still pass unmodified.

---

## Final summary

**Proposed exact S7 boundary**: a Node-owned staff identity (linked to,
not duplicating, the existing `counsellors` table), an independent
Node-issued staff session token, and application-layer (not RLS-based)
district-scope and case-ownership enforcement on a small, new set of
console-shaped read endpoints — with a minimal audit-hook table laid down
for later milestones. Real RLS, break-glass, the full audit subsystem, the
React console app, and any FastAPI or frontend modification are all
explicitly out of this boundary.

**Major blockers**: (1) the Section B staff/counsellor linkage shape is an
undecided design question that must be resolved first; (2) the RLS
connection-pooling hazard (Section H) means real `app.district_scope`
RLS is not safely implementable in this slice and must be deferred, not
faked.

**Exact files likely to change**: listed in full in Section P — entirely
new/additive on the Node side plus one new additive SQL migration; zero
FastAPI or frontend/mobile files.

**Tests required**: listed in full in Section Q.

**Should implementation proceed?** Yes, **conditionally** — the dependency
structure supports starting S7 now (identity/token/guard patterns are
proven three times over in S4–S6, and application-layer scoping needs no
new infrastructure), **provided** the Section B linkage decision is made
explicitly before writing schema/code (not improvised mid-implementation),
and **provided** real RLS is knowingly deferred rather than attempted
under the current connection-pooling constraints. Neither condition
requires new research — both are ready to be decided at the start of an
implementation session.

---

## Git status at time of this audit

No files were modified except this document.

```
On branch feat/aavaz-integration
Untracked files:
  docs/S7_STAFF_CONSOLE_AUDIT.md
```

HEAD unchanged at `87a57766c11ccca3f1ef53284c93a26291fa36f3` throughout.
Nothing staged, nothing committed, nothing pushed.
