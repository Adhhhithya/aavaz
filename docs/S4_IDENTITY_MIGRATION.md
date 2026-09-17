# S4_IDENTITY_MIGRATION.md

Phase 1 mapping for the first Node.js `core-api` extraction slice: **identity +
OTP + victim authentication**. This document records exactly where each piece
of the current behavior lives today (re-verified by reading the actual files,
not from memory of earlier sessions), what its target Node ownership is, and
its migration status after this milestone. It intentionally does not propose
architecture beyond this one slice.

Format: `CURRENT COMPONENT → CURRENT LOCATION → TARGET NODE COMPONENT →
MIGRATION STATUS`.

---

## Victim OTP

| Current component | Current location | Target Node component | Migration status |
|---|---|---|---|
| OTP code generation (6-digit, `secrets.randbelow`) | `backend/services/otp_service.py::generate_code` | `apps/core-api/src/identity/otp.service.ts::generateCode` (Node `crypto.randomInt`) | **Ported.** Node implementation added; Python implementation left running and unmodified. |
| OTP hashing (HMAC-SHA256, salted, peppered) | `backend/services/otp_service.py::_hash_code` / `hash_phone` | `otp.service.ts::hashCode` / `hashPhone` | **Ported.** Same algorithm (HMAC-SHA256), same shape (per-code random salt + server pepper), so a value hashed by either implementation is verifiable by the other **only if they share the same pepper** — see "Shared secret risk" below. |
| OTP persistence | `otp_codes` table, written via `supabase-py` (`services/otp_service.py`) | `otp_codes` table, written via Prisma (`apps/core-api/src/identity/otp.service.ts`) | **Same table, two writers for now.** No new table created — Phase 3 requirement. Node's Prisma model was derived from real introspection of the migration in `backend/migrations/0002_otp_codes.sql` (see "Database ownership" below), not invented independently. |
| OTP verification (constant-time compare, single-use) | `backend/services/otp_service.py::verify_otp` | `otp.service.ts::verifyOtp` | **Ported.** Uses Node's `crypto.timingSafeEqual` (the Node equivalent of Python's `hmac.compare_digest`) for the constant-time comparison requirement. |
| OTP attempt counting (max 3) | `otp_codes.attempts`/`max_attempts` columns, incremented in `verify_otp` | Same columns, incremented in `otp.service.ts::verifyOtp` | **Ported**, same column semantics. |
| OTP expiration (5 minutes) | `otp_codes.expires_at`, checked in `verify_otp` | Same column, same check | **Ported.** |
| Phone/IP rate limiting | `backend/services/otp_service.py::_count_recent` (rolling-window row counts) | `otp.service.ts::countRecent` | **Ported**, identical query shape (count rows for `phone_hash`/`ip_hash` within `OTP_RATE_LIMIT_WINDOW_SECONDS`). |
| OTP delivery provider abstraction | `backend/services/otp_providers.py` (`OtpProvider`, `SyntheticOtpProvider`, `PushbulletOtpProvider`) | `apps/core-api/src/identity/otp-provider.ts` | **Partially ported.** `SyntheticOtpProvider` is fully ported and behaves identically (refuses construction outside `NODE_ENV=development`, logs a `[DEV ONLY]`-prefixed message). A real production provider is **not** implemented in Node — see "Deliberately not ported" below; this is a documented gap, not a silent omission. |

## Victim identity / session

| Current component | Current location | Target Node component | Migration status |
|---|---|---|---|
| Registration-only identity token (`phone_verified`) | `backend/api/auth/victim_dependencies.py::issue_phone_verified_token` | `apps/core-api/src/identity/token.service.ts::issuePhoneVerifiedToken` | **Ported.** Same two-purpose-token design (`phone_verified` vs `victim`), same non-interchangeability guarantee, re-verified by an equivalent Node test. |
| Authenticated victim identity token (`victim` session) | `backend/api/auth/victim_dependencies.py::issue_victim_session_token` | `token.service.ts::issueVictimSessionToken` | **Ported.** |
| `get_current_victim` (resolve authenticated principal → victim_id from a bearer token, server-side only) | `backend/api/auth/victim_dependencies.py::get_current_victim` | `apps/core-api/src/identity/victim-auth.guard.ts` (NestJS `CanActivate` guard) | **Ported**, as a Nest guard rather than a FastAPI dependency (idiomatic per-framework equivalent, not a behavior change) — attaches the resolved victim onto the request, same as the Python dependency injecting `CurrentVictim`. |
| Victim authorization (a client-supplied id must match the authenticated principal) | Per-route checks in `backend/api/intake/app_routes.py`, `chatbot_routes.py`, `sos_routes.py`, `ecourts_routes.py` (S2) | N/A in this slice — see "Deliberately not ported" | **Not ported.** Those routes belong to case/chatbot/eCourts domains, not identity. Only the *identity* primitive (`get_current_victim`) is ported here; the routes that *use* it for cross-victim checks stay in FastAPI until their own domain (`profile-case`, chatbot/agent, etc.) is extracted. |
| Combined staff-or-victim resolution for the one dual-consumer endpoint | `backend/api/auth/victim_dependencies.py::get_case_access_principal` | N/A in this slice | **Not ported.** This exists to authorize `GET /api/v1/cases/{case_id}/progress`, a case-domain endpoint, not an identity endpoint. Stays in FastAPI until the case domain moves. |
| Registration itself (create a `users` row from a verified phone) | `backend/api/intake/app_routes.py::register_user` — **also** creates a `cases` row and runs counsellor auto-assignment in the same request | `apps/core-api/src/identity/identity.controller.ts` (`POST /api/v1/auth/register`) | **Partially ported, deliberately.** Node's version creates only the `users` row (pure identity) and does **not** create a case or run assignment — those are `profile-case`/`assignment` domain concerns for a later slice. This makes Node's `/register` **not yet a behavioral drop-in** for FastAPI's `/register` — recorded explicitly in Phase 7 as the reason FastAPI's endpoint remains the one real clients use for now. |
| Existing-victim lookup by phone (for issuing a session at login rather than registration) | `backend/api/auth/victim_dependencies.py::resolve_victim_by_phone` | `apps/core-api/src/identity/identity.service.ts::findVictimByPhone` | **Ported.** |

## Staff authentication (out of scope for this slice — mapped for completeness only)

| Current component | Current location | Target Node component | Migration status |
|---|---|---|---|
| Staff Supabase Auth login | `backend/api/auth/auth_routes.py::login` | *(not created)* | **Deliberately deferred.** The milestone objective is explicitly "identity + OTP + victim authentication" — staff auth is a separate mechanism (Supabase email/password, not OTP-based) with its own consumers (the counsellor/admin dashboards). Moving it is a future, separate extraction slice, not part of S4. Not touched in this pass. |
| `get_current_staff_user` / `require_roles` | `backend/api/auth/dependencies.py` | *(not created)* | **Deliberately deferred**, same reasoning. |

## Relevant database access

| Current component | Current location | Target Node component | Migration status |
|---|---|---|---|
| `otp_codes` table definition | `backend/migrations/0002_otp_codes.sql` (additive migration, S2) | `apps/core-api/prisma/schema.prisma` — `OtpCode` model | **Modeled via real introspection**, not re-invented — see "Database ownership" below. Table itself is not duplicated or altered. |
| `users` table definition | `backend/schema.sql` | `apps/core-api/prisma/schema.prisma` — `User` model | **Modeled via real introspection**, restricted to the columns the identity module actually reads/writes (see below) — Node does not claim ownership of columns/behavior it has no logic for yet (e.g. `location_district`/`location_state` are carried as passive fields since registration accepts them today, but nothing in this slice computes them). |
| Every other table (`cases`, `interactions`, `counsellors`, `sos_events`, `case_updates`) | `backend/schema.sql` | *(not modeled)* | **Deliberately not included** in `apps/core-api`'s Prisma schema. These belong to domains (`profile-case`, `triage`, etc.) this slice does not touch. Including them now would be exactly the "speculative architecture beyond this slice" the task instructs against. |

---

## Database ownership: how the Prisma schema was actually produced

Per Phase 3's explicit instruction not to assume `schema.sql` is authoritative
and to use introspection carefully where appropriate: no live Supabase
project exists in this environment (confirmed in S3 — no `.env`/credentials
anywhere). The same technique used in S3 to verify the OTP migration for real
was used again here, this time to drive genuine Prisma introspection rather
than a hand-typed schema:

1. A fully isolated, throwaway PostgreSQL 17 cluster was created in the
   session's scratch directory (never touching the developer's own running
   Postgres service), with `backend/schema.sql` and
   `backend/migrations/0002_otp_codes.sql` applied to it in order — the exact
   same two files that would be applied to a real Supabase project, per the
   existing documented workflow.
2. `npx prisma db pull` was run against that throwaway database from inside
   `apps/core-api`, producing a real, tool-generated `schema.prisma` reflecting
   every table Postgres actually has (all 7: `users`, `cases`, `interactions`,
   `counsellors`, `sos_events`, `case_updates`, `otp_codes`), their real
   column types/nullability/defaults, and the custom enum types `schema.sql`
   defines.
3. The full introspected output was reviewed, then the checked-in
   `schema.prisma` was deliberately pruned to keep only the `User` and
   `OtpCode` models this slice's code actually uses — not because the other
   tables don't exist, but because modeling tables with no owning logic yet
   would misrepresent what Node actually owns today.
4. The throwaway cluster was stopped and its data directory deleted
   immediately afterward — nothing was left running or behind.

This is real verification of the schema shape, not a guess — but it is still
**schema-level** verification only (real PostgreSQL DDL, not a live Supabase
project with Auth/PostgREST), the same caveat already recorded in S3.

## Shared secret / dual-authority risk (read before any cutover)

Node's OTP hashing and JWT signing use their own environment-configured
secrets (`OTP_PEPPER`, `VICTIM_SESSION_SECRET` — Node-side env vars, distinct
variable names from Python's identically-purposed `OTP_PEPPER`/
`VICTIM_SESSION_SECRET`, see Phase 11 config notes). **If both services were
ever run against the same `otp_codes` table in production with different
pepper values, an OTP requested via one service could never be verified via
the other**, and a JWT issued by one could never be verified by the other.
This is not a bug to fix now — it is the direct, expected consequence of
"there must be one clear authority" (Phase 6): as long as only one service is
live for a given victim's request at a time (see Phase 7 below), this never
arises. It becomes a real constraint only at the moment of cutover, where the
secrets must either be provisioned identically to both services during a
transition window, or the cutover must be atomic (stop issuing via one,
start via the other, with a brief window where in-flight OTPs from the old
service simply expire naturally within their 5-minute TTL rather than being
verified by the new one).

## Deliberately not ported in this slice

- **`PushbulletOtpProvider`** (real SMS delivery) — the Python version was
  already flagged in S2 as unverified against a live account. Porting an
  equally-unverified implementation to Node would not add real coverage, so
  Node's provider interface has a stub that throws a clear
  "not implemented — see docs/S4_IDENTITY_MIGRATION.md" error if selected
  outside development, rather than a second unverified HTTP client. See
  Phase 4 in the final report for the exact rationale.
- **Cross-victim authorization on case/chatbot/eCourts/SOS endpoints** — these
  remain FastAPI-owned per the table above; only the identity primitive they
  depend on (`get_current_victim`) is duplicated in Node for this slice.
- **Staff authentication** — see the dedicated table above.
- **Registration's case-creation and counsellor-assignment side effects** —
  see the registration row above.

## API endpoints created (Phase 6)

All under `apps/core-api`, mounted at `/api/v1/auth` (matching FastAPI's
existing `/api/v1/auth/*` prefix convention so the path shape is familiar,
even though the two are not yet interchangeable — see below):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/auth/otp/request` | none | Request an OTP for a phone number. Rate-limited by phone and IP. |
| `POST` | `/api/v1/auth/otp/verify` | none | Verify an OTP. Returns a `victim_session` token directly if the phone already has a `users` row, otherwise a `phone_verified` token for registration. |
| `POST` | `/api/v1/auth/register` | `Bearer <phone_verified token>` | Create a `users` row (identity only — no case, no assignment). Returns a `victim_session` token. |
| `GET` | `/api/v1/auth/me` | `Bearer <victim_session token>` | Returns the authenticated victim's id/phone from the token claims. A verification/demonstration endpoint, not consumed by any real client. |

No other public endpoints were added — no `/health`, no admin/console routes,
nothing beyond what this slice's identity flow requires, per Phase 6's "don't
invent unnecessary public endpoints" instruction.

**One authority, by construction, not by coordination:** nothing in Node
calls FastAPI's auth endpoints, and nothing in FastAPI calls Node's. They are
two independent, non-interacting implementations of the same contract against
the same tables. The "one clear authority" requirement is currently satisfied
trivially — **FastAPI's `/api/v1/auth/otp/request` and `/api/v1/auth/otp/verify`
remain the only implementation any real client (frontend, mobile) actually
calls.** Node's endpoints exist, are tested, and are provably correct against
real PostgreSQL, but are not wired into the request path of any product
surface yet.

## FastAPI transitional behavior and planned removal point (Phase 7)

FastAPI's existing identity code (`backend/services/otp_service.py`,
`backend/api/auth/victim_dependencies.py`, `backend/api/intake/app_routes.py`)
was **not modified or removed** in this slice. It remains the sole production
authority. Concretely:

- **Today:** FastAPI = authoritative and live. Node = implemented, tested,
  dormant (no client calls it).
- **Coexistence strategy for the transition window:** when a client cutover
  is eventually scheduled, it must be per-surface and explicit — e.g. the
  mobile app's OTP screens are repointed from `backend`'s base URL to
  `core-api`'s, one flow at a time, not a shared flag inside a single client
  build that could race between the two authorities for the same user. Any
  overlap window must either (a) provision both services with the same
  `OTP_PEPPER`/`VICTIM_SESSION_SECRET` values so tokens/OTPs issued by either
  are honored by both, or (b) be instantaneous (stop accepting new
  requests on the old path, start on the new one), letting any in-flight OTP
  from the old service simply expire within its 5-minute TTL. Option (a) is
  simpler operationally but reintroduces the shared-secret coordination this
  document already flags as a risk; (b) has zero shared-secret risk but a
  short user-visible "please request a new code" edge case for anyone mid-OTP
  at the exact cutover instant. This decision is deferred to whoever plans
  the actual cutover slice — recorded here so it isn't decided implicitly.
- **Planned removal point for the old (FastAPI) authentication path:**
  FastAPI's OTP/victim-identity code should be deleted **only after**: (1)
  every client that calls it (frontend `AuthContext.jsx`/`Login.jsx`, mobile
  `RegisterScreen.jsx`/`OTPVerificationScreen.js`/`api.js`) has been
  repointed to `core-api` and verified in real use, (2) Node's `/register`
  has been extended to cover registration's current side effects (case
  creation, counsellor auto-assignment) or those effects have themselves
  moved to their own Node domain, so Node's endpoint is a true behavioral
  superset of FastAPI's, and (3) a short bake-in period has passed with no
  traffic observed on the FastAPI paths (verifiable via existing request
  logging). Until all three hold, FastAPI's identity code must stay — it is
  explicitly **not** scheduled for removal as part of S4 or immediately
  after it.

## Frontend / mobile scope (Phase 8)

**No frontend or mobile files were changed in this slice.** Node's endpoints
are not consumed by `frontend/` or `mobile/` yet — `frontend/src/context/
AuthContext.jsx`, `frontend/src/pages/Login.jsx`, `mobile/src/screens/
OTPVerificationScreen.js`, `mobile/src/screens/RegisterScreen.jsx`, and
`mobile/src/services/api.js` all continue to call FastAPI exactly as before.
This is a deliberate scope decision, not an oversight: repointing any client
now would mean cutting over to an endpoint (`/register`) that is not yet a
behavioral drop-in (see the registration row above and Phase 7), which would
either require also porting registration's case-creation/assignment side
effects in this same slice (out of scope — "not a backend rewrite", "begin
incremental migration") or shipping a client-visible regression. Client
migration is deferred to the slice that also completes Phase 7's cutover
plan.

## Model-provider isolation (Phase 10)

`apps/core-api` has no dependency on, import of, or network call to Groq,
OpenAI, Gemini, Anthropic, LangChain, or any other LLM/model provider —
verified by grepping `apps/core-api/src` for those names (no matches) in
addition to the fact that `package.json`'s dependency list (Phase 2/11
section above) contains no such SDK. Node core-api's only external
dependency of any kind is PostgreSQL (via Prisma). This was true by
construction (nothing in the OTP/identity domain has any reason to touch a
model provider) and is recorded here as an explicit, checked fact rather
than an assumption.

## Windows-specific testing note

The integration test (`test/identity.integration-spec.ts`) spins up a real,
throwaway PostgreSQL cluster per run. On Windows, `pg_ctl start` launches
`postgres.exe` as a **detached** background process that inherits whatever
stdio handles the launching process was given. If that call is made with
Node's `spawnSync`/`execFileSync` using piped stdio (the default), the
detached `postgres.exe` — which keeps running by design — never closes its
inherited copy of the pipe, so Node's synchronous read blocks forever
waiting for EOF that will never come, even though `pg_ctl` itself already
exited successfully. This is why the `pg()` helper passes `stdio: 'ignore'`
specifically for the `pg_ctl ... start` call (startup failures are still
diagnosable via `pg_ctl`'s own exit code plus the cluster's `server.log`).
Anyone modifying this test should preserve that, or the suite will appear to
hang indefinitely rather than fail fast.
