# S6_ONBOARDING_MIGRATION.md

Phase 1/2 record for the third Node.js `core-api` extraction slice:
**consent + profile + safety-settings domain extraction**. Builds on
`docs/S4_IDENTITY_MIGRATION.md` (identity/OTP) and
`docs/S5_REGISTRATION_MIGRATION.md` (registration/case/assignment), which
this document assumes and does not repeat.

Target slice: `authenticated victim -> consent -> profile/preferences ->
safety settings`. Not the entire onboarding workflow, not scheduling, not
baseline check-ins, not the conversation agent, not referrals, not the
channel gateway — see the task's STOP conditions.

---

## Phase 1 — Existing implementation, traced

Traced directly from `backend/models/intake_models.py`,
`backend/api/intake/app_routes.py`, `backend/api/intake/ivr_webhook.py`,
`backend/api/intake/sms_webhook.py`, `backend/schema.sql`,
`mobile/src/screens/ConsentScreen.jsx`, `mobile/src/screens/RegisterScreen.jsx`,
`frontend/src/pages/Login.jsx`, and a full-repo search for
duress/disguise/safe-word/trusted-contact terminology. Not assumed correct.

### Consent

| Item | Finding |
|---|---|
| API routes | **None dedicated to consent.** The only consent-related write is embedded inside `POST /api/v1/intake/app/register` (`app_routes.py::register_user`) and the two intake webhooks. |
| Request model | `AppRegistrationRequest.consent_given: bool` (`models/intake_models.py`) — a single required boolean, no scope, no text/version. |
| Database writes | `users.consent_given BOOLEAN`, `users.consent_timestamp TIMESTAMPTZ` (`schema.sql`) — set once, at registration, never updated afterward by any endpoint. |
| Validation | Presence/type only (Pydantic `bool`). No scope concept exists to validate. |
| Authentication | Registration's own auth (phone-verified token) — consent itself has no separate authorization check because it isn't a separate write. |
| Frontend/mobile callers | `mobile/src/screens/RegisterScreen.jsx` and `frontend/src/pages/Login.jsx` (web self-registration) both **hardcode `consent_given: true`** in the registration payload — no real consent screen is shown in the actual registration flow of either client. `mobile/src/screens/ConsentScreen.jsx` **exists but is disconnected** from the registration flow entirely: it renders a single generic "I consent to protected telemetry tracking" toggle, its `onConsent` callback carries no payload at all, and nothing in the codebase wires it into `RegisterScreen.jsx` or any API call. This matches `docs/AAVAZ_MIGRATION_PLAN.md` §3's own prior finding ("`ConsentScreen.jsx` exists but is unused by the actual registration flow"). |
| Additional hardcoding found (Phase 1, not assumed correct) | `backend/api/intake/ivr_webhook.py:31` and `backend/api/intake/sms_webhook.py:41` **also** hardcode `"consent_given": True` when auto-creating a user from an inbound IVR call or SMS ("implied by IVR interaction for demo" / "implied by texting in") — two more sites where "consent" is a fabricated `true`, not a captured decision. |
| Tests | None. No Python test exercises consent behavior at all. |

**Total inventory of `consent_given: true`/`True` hardcoding found in this
repository**: `mobile/src/screens/RegisterScreen.jsx`,
`frontend/src/pages/Login.jsx`, `backend/api/intake/ivr_webhook.py`,
`backend/api/intake/sms_webhook.py` — four sites, all pre-existing, all
outside this slice's scope (three are FastAPI/client code this task does
not touch; see Phase 13 for their classification).

### Profile / victim preferences

| v0.2 field | Current implementation |
|---|---|
| Alias or name | `users.name` — collected at registration, no separate alias concept, no update endpoint. |
| Language | `users.preferred_language` (`lang_enum`) — collected at registration, no update endpoint. |
| District | `users.location_district` — resolved via `services/location_resolver.py`, which is an explicit **mock** (`if lat and lng: return "Mock District", "Mock State"`), already ported 1:1 into Node in S5 (`apps/core-api/src/cases/location.service.ts`). No update endpoint. |
| Relation to case (survivor/family member) | **Does not exist.** The closest existing concept is `users.role_type` (`role_type_enum`: `victim`/`witness`/`family`) — a broader, three-value, registration-time self-identification field, not the same two-value concept v0.2 describes. |
| Crime category | **Does not exist anywhere** — no column on `users` or `cases`. Note: v0.2's own data model (§12) places `crime_category` on **`cases`**, not on the victim/profile row at all. |
| Preferred contact channel | **Does not exist anywhere.** |
| Safe contact windows | **Does not exist anywhere.** |
| Whether calls are safe at all | **Does not exist anywhere.** |
| Read/update endpoints | **None.** A victim cannot read or change any profile field after registration in the existing implementation — `register_user` is a write-once operation. |
| Tests | None. |

### Safety settings

| v0.2 field | Current implementation |
|---|---|
| App disguise | **Does not exist anywhere** in backend, frontend, or mobile source. |
| Duress PIN | **Does not exist anywhere.** No PIN-based mechanism of any kind exists in this codebase — authentication is phone+OTP only (S2/S4). |
| Trusted contact | **Does not exist anywhere.** (Mobile's `RegisterScreen.jsx` collects an `emergencyName`/`emergencyPhone` pair in local component state for its own UI, but — confirmed by reading the code — **never sends it to any backend endpoint**; it is used only in the client's own local `onCompleteSetup` callback and goes nowhere.) |
| Safe word | **Does not exist anywhere.** |
| Quick-exit control | **Does not exist anywhere**, and per v0.2's own `safety_settings` data model, this was never meant to be server-stored state to begin with (see Phase 6). |
| Opt-out | **Does not exist anywhere** — no opt-out endpoint, no `lifecycle_state` concept, no purge job. See Phase 8. |
| Tests | None. |

---

## Phase 2 — v0.2 requirements vs. current behavior

Read from `docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf`, Workflow A steps
A2/A3/A5 and the §12 data model.

| Requirement | Current FastAPI behavior | Current Node behavior (pre-S6) | Target Node behavior (this slice) | Status | Notes |
|---|---|---|---|---|---|
| Consent scopes: `monitoring` (required), `store_transcripts`, `voice_recording`, `share_mental_health`, `share_legal_aid`, `share_welfare`, `share_protection` | One undifferentiated boolean | None | All 7 scopes accepted individually via `POST /v1/consents`; only `monitoring` is spec-marked required (informational — see Phase 4, not enforced as a hard gate in this slice) | **Implemented** | `apps/core-api/src/consent/consent-copy.ts::CONSENT_SCOPES`/`REQUIRED_CONSENT_SCOPES`. |
| Exact consent text/version hashing | Not applicable (no scoped text exists to hash) | None | SHA-256 of a server-resolved, versioned copy string per scope, stored per grant | **Implemented** | See Phase 4 — the copy text itself is a documented placeholder, not invented legal language. |
| Profile fields (relation, preferred channel, safe windows, safe-to-call) | Only `name`/`language`/`district` exist, write-once | None | New `victim_profiles` table; `GET`/`PATCH /v1/victims/me/preferences` | **Implemented** (relation/channel/windows/safe-to-call only — name/language/district intentionally NOT duplicated, see Phase 5) | |
| Crime category | Does not exist | None | Not implemented | **Deferred** | v0.2 places this on `cases`, not the victim profile — out of this module's scope; a case-domain gap, not a profile-domain one. |
| Safety settings: disguise, duress PIN, trusted contact, safe word | Do not exist | None | New `safety_settings` table; `GET`/`PATCH /v1/victims/me/safety-settings` | **Implemented** | Duress PIN and safe word are Argon2id-hashed; trusted contact is plain text (documented gap, see Phase 6). |
| Duress PIN "must differ from login PIN" | N/A (no PIN login exists) | N/A | Not enforced | **Deferred (unenforceable)** | This codebase has no PIN-based login mechanism at all to compare against — see Phase 6. Not silently treated as satisfied. |
| Duress PIN "works everywhere a PIN is asked... router treats it as Critical" | N/A | N/A | Not implemented | **Deferred** | Live-call/session-time behavior — `agent-svc`/`channel-gateway`, explicitly out of this slice's STOP conditions. Only storage + server-side verification exist. |
| Quick-exit control | N/A | N/A | Not implemented | **Deferred (client-only concept)** | v0.2's own `safety_settings` data model has no column for it — it isn't server state to begin with. |
| Opt-out implications | Do not exist | None | Not implemented; new tables designed not to block a future opt-out | **Deferred, compatibility preserved** | See Phase 8. |
| district_code + RLS on victim-linked tables | Not implemented (service-role bypasses existing RLS everywhere, per `docs/AAVAZ_IMPLEMENTATION_AUDIT.md`) | Not implemented | Not implemented | **Deferred, documented** | See Phase 7 — no `district_code` column added to the new tables; ownership enforced at the application layer instead. |

No requirement was invented beyond what v0.2's text states — anywhere this
document says "not specified," that reflects the spec's actual silence, not
an assumption.

---

## Phase 3 — Node domain modules

Three focused modules were added to `apps/core-api/src/`, each following
the same shape as prior slices:

- **`consent/`** — `consent.module.ts`, `consent.controller.ts`,
  `consent.service.ts`, `consent-copy.ts`, `dto/grant-consent.dto.ts`.
- **`profile/`** — `profile.module.ts`, `profile.controller.ts`,
  `profile.service.ts`, `dto/update-preferences.dto.ts`.
- **`safety/`** — `safety.module.ts`, `safety.controller.ts`,
  `safety.service.ts`, `dto/update-safety-settings.dto.ts`.

No placeholder modules were created for anything in the STOP list.
`VictimAuthGuard` was exported from `IdentityModule` (previously
identity-internal) so these three modules can authenticate their own
endpoints without duplicating token-verification logic — each imports
`IdentityModule` for exactly that.

**Database**: one new additive migration,
`backend/migrations/0004_consent_profile_safety.sql`, adding three new
tables (`consents`, `victim_profiles`, `safety_settings`) — no existing
table altered, renamed, or dropped. Real introspection (the same
throwaway-Postgres + `prisma db pull` technique used in S4/S5) was re-run
with this migration applied before writing `Consent`/`VictimProfile`/
`SafetySetting` into `prisma/schema.prisma`, and real CRUD (including the
append-only consent-history pattern) was smoke-tested against a live
Postgres instance before it was torn down. No duplicate tables were
created, and no second ORM was introduced.

---

## Phase 4 — Consent

`ConsentService.grantConsent(userId, dto)` inserts a **new row** into
`consents` per call (v0.2: "each grant writes a row") — never an update in
place, so the full grant/revoke history for a victim is preserved.
`getCurrentConsents(userId)` returns only the most recent row per scope; a
scope the victim has never acted on is simply absent from the result, never
fabricated as `granted: false`.

**Required vs. optional scopes**: v0.2 marks only `monitoring` as
"(required)"; the other six are optional by omission. This slice records
that distinction (`REQUIRED_CONSENT_SCOPES`) but does **not** enforce it as
a hard gate anywhere (e.g. blocking registration or other endpoints until
`monitoring` is granted) — building that cross-endpoint onboarding gate is
explicitly out of scope ("do not implement the entire onboarding
workflow").

**Text/version hashing, without inventing legal language**: v0.2 requires
"the SHA-256 hash of the exact consent text version shown" but does not
itself specify final legal wording for any scope (its own cover page notes
statutory references are placeholders pending legal review). Per this
milestone's explicit instruction, `consent-copy.ts` defines one
clearly-labeled **placeholder** copy string and version per scope, in a
single configurable location — not fabricated statutory text. The server
resolves the current copy for the requested scope and hashes it itself;
`GrantConsentDto` has **no** `text`/`textVersionHash` field at all, so a
client cannot supply either — confirmed in the integration suite by sending
an extra `textVersionHash` field and observing it has no effect (NestJS's
global `whitelist: true` strips it before the DTO is even constructed,
and the service never reads request-supplied text regardless).

**Authority**: `userId` is always the `@Victim()`-decorated value resolved
by `VictimAuthGuard` from the bearer token — there is no field anywhere in
`GrantConsentDto` for a client to supply a different victim/user id.

---

## Phase 5 — Profile

`victim_profiles` is a 1:1 extension of `users`, keyed by `userId` — **not**
a second victim record; `users` remains the single identity-bearing row
(identity-module-owned, S4). Deliberately does **not** duplicate
`name`/`preferred_language`/`location_district`, which already exist on
`users` and stay identity/registration-owned — re-modeling them here would
both violate "do not create a second victim record" in spirit and blur the
identity/profile module boundary this phase asks for. Deliberately does
**not** include `crime_category` — v0.2's own data model places that field
on `cases`, not the victim, so it is out of this module's scope (a
case-domain gap, tracked in Phase 2, not silently absorbed here).

`GET`/`PATCH /v1/victims/me/preferences` use PATCH semantics (only supplied
fields change) via an upsert, since a victim may not have a
`victim_profiles` row yet. Ownership is server-side only: `userId` always
comes from `@Victim()`, never a route parameter or body field — proven in
the integration suite by having two victims each `PATCH` different values
and confirming neither's `GET` ever reflects the other's.

---

## Phase 6 — Safety settings

`safety_settings` is likewise a 1:1 extension of `users`. Implemented:
`disguiseEnabled` (boolean), duress PIN (Argon2id-hashed), safe word
(Argon2id-hashed, matching v0.2's own `safe_word_hash` column-naming
choice), and trusted contact (name + phone, plain text — see below).

**Duress PIN security**:
- Hashed with `@node-rs/argon2` (defaults to Argon2id — verified directly:
  every stored hash matches `/^\$argon2id\$/`), never stored or logged in
  plaintext. No `Logger`/`console` call anywhere in `safety.service.ts` or
  `safety.controller.ts` references the PIN or safe word value at all —
  confirmed by a unit test that spies on every `Logger` method and asserts
  the raw values never appear in any logged text.
- **Never returned** by any method or endpoint — `getSettings`/
  `updateSettings` return only `hasDuressPin`/`hasSafeWord` booleans; the
  hash column names (`duressPinHash`/`safeWordHash`) never appear in any
  controller response, confirmed by an explicit test asserting those keys
  are absent from the returned object.
- **Verification is server-side only**: `SafetyService.verifyDuressPin`
  compares against the stored hash via `argon2.verify` and is unit- and
  integration-tested (correct PIN succeeds, incorrect PIN fails, no PIN set
  fails safely rather than erroring, one victim's PIN never verifies
  against another victim's id). There is **no public HTTP endpoint** for
  this in this slice — live-call duress detection ("works everywhere a PIN
  is asked... router treats it as Critical") is session/call-time logic
  belonging to `agent-svc`/`channel-gateway`, both explicitly out of scope
  per the STOP conditions. The verification capability exists and is
  proven correct; it is simply not wired to any client-reachable route yet.
- **"Must differ from the login PIN" is NOT enforced** — documented as an
  unenforceable gap, not silently treated as satisfied: this codebase has no
  PIN-based login mechanism anywhere (authentication is phone+OTP only), so
  there is no login PIN value to compare a duress PIN against. Inventing one
  purely to satisfy this check was rejected as out of scope and dishonest.

**Trusted contact — plain text, not encrypted**: v0.2's own column name is
`trusted_contact_enc`. This codebase has no KMS-backed, per-victim envelope
encryption anywhere (a gap already recorded in `docs/AAVAZ_MIGRATION_PLAN.md`
§7), so encrypting this column is not currently possible to do for real.
The column is deliberately named `trusted_contact_name`/`_phone` (no `_enc`
suffix) rather than a name that would falsely claim encryption. This is
consistent with, not a regression from, the existing app's overall
unencrypted storage of `users.phone_number`.

**Disguise / quick-exit**: v0.2's own `safety_settings` data model has only
`disguise_enabled` (boolean) — no stored "neutral name and icon" value —
and no column at all for a quick-exit control. Both are matched exactly:
`disguiseEnabled` is a plain boolean, and nothing further is invented for
either. The visual disguise skin and quick-exit UI are client-side
rendering concerns with no corresponding server state, in both v0.2's own
model and this implementation.

**No crisis-workflow or emergency-contacting behavior was added**, per this
phase's explicit instruction — `verifyDuressPin` returning `true` does
nothing beyond returning `true`; no alerting, escalation, or notification
side effect exists anywhere in this slice.

---

## Phase 7 — RLS / database ownership

Real introspection (not an assumption that `schema.sql` matches the live
schema) was used the same way as S4/S5 — see Phase 3. `consents`,
`victim_profiles`, and `safety_settings` all reference `users(id)` with
`ON DELETE CASCADE`; all three have `ENABLE ROW LEVEL SECURITY` with
deliberately no permissive policies attached, the exact same
defense-in-depth pattern already used for `otp_codes` in S2/S4 (documented
in the migration file itself).

**This is explicitly NOT v0.2's district-scoped RLS model.** v0.2 (§12)
requires every victim-linked table to carry `district_code` and enforce
access via a Postgres policy keyed on `current_setting('app.district_scope')`,
set per-request by `core-api` for staff/case-manager-scoped access. None of
the three new tables carry a `district_code` column, and no such policy
exists. This is a deliberate, documented decision, not an oversight or a
faked claim:

1. **It doesn't apply yet.** District-scoped RLS exists to limit which
   *staff/case-manager* can see which *victims*. No staff-facing Node
   endpoint exists anywhere through S6 — every endpoint in this slice is
   victim-self-service only, authenticated as the victim themselves.
   Ownership for "can this victim see/change this row" is enforced entirely
   at the application layer (`VictimAuthGuard` + querying by the
   authenticated victim's own id), which is the correct and sufficient
   mechanism for that specific question — district-based Postgres RLS would
   add nothing to it.
2. **A large RLS/database redesign was explicitly out of scope** for this
   slice unless "the existing schema and migration strategy make the
   required change safe and well-defined" — it does not yet: Node connects
   with a single, service-role-equivalent credential (same as every prior
   slice and the same pattern already flagged as a gap in
   `docs/AAVAZ_IMPLEMENTATION_AUDIT.md`), not a per-request,
   district-scoped session, so adding a `district_code` column now with no
   connection-level mechanism to actually set/enforce
   `app.district_scope` would be exactly the "fake RLS" this phase
   prohibits — an unused column that implies protection that doesn't exist.
3. **This becomes a real requirement at the console/staff-endpoint
   milestone**, not before. Tracked here so it isn't forgotten, not
   implemented here so it isn't faked.

No destructive migration was performed; `0004_consent_profile_safety.sql`
is additive only (verified by an automated test that greps the file, with
comments stripped, for `DROP`/`TRUNCATE`/`DELETE FROM` and asserts none
exist).

---

## Phase 8 — Opt-out compatibility

No opt-out or purge workflow exists anywhere in this codebase today, and
none is implemented in this slice — building the v0.2 purge job, lifecycle
state machine, and legal-hold check is explicitly future work. What this
slice does ensure is that consent/profile/safety code does not make a
future opt-out **harder**:

- All three new tables use `ON DELETE CASCADE` on their `user_id`/`userId`
  foreign key. If a `users` row is ever deleted by a future purge job, its
  consent history, profile, and safety settings are removed automatically —
  no orphaned rows, no manual cleanup step to remember, no referential
  integrity error blocking the delete.
- Consent's append-only design means a future opt-out flow can simply
  insert a new `granted: false` row per scope (consistent with how every
  other consent change already works) rather than needing special-cased
  "delete/deactivate" logic.
- No new scheduled job, cron entry, or outreach mechanism was created by
  this slice, so there is nothing new for a future opt-out to have to learn
  to cancel.

**Explicitly deferred to later milestones** (not attempted here): cancelling
scheduled outreach on opt-out (no scheduler exists yet — S6 doesn't create
one), handling open referrals at opt-out time (no referral system exists
yet), retention-period enforcement, the actual purge job, and legal-hold
checks before purge. All of these require subsystems this slice's STOP
conditions explicitly exclude.

---

## Phase 9 — FastAPI coexistence

**FastAPI remains the sole live authority**, unchanged from S4/S5's
conclusion. Nothing in this slice modifies `backend/api/intake/app_routes.py`,
`ivr_webhook.py`, `sms_webhook.py`, or any other existing Python file — the
hardcoded `consent_given: true`/`True` sites identified in Phase 1 are left
exactly as they are (see Phase 13 for why that's a deliberate scope
decision, not an oversight).

**Node shadow/extraction behavior**: unlike S4/S5 (which ported existing
FastAPI behavior), this slice's consent/profile/safety capability has **no
FastAPI equivalent to shadow or diverge from** — FastAPI never exposes a
consent-scope, profile-read/update, or safety-settings endpoint of any kind.
Node's new tables and endpoints are pure net-new capability sitting
alongside FastAPI, not a competing implementation of the same feature. This
means the **dual-write risk this phase asks about is currently zero for
these three specific tables** — FastAPI has no code path that could ever
write to `consents`, `victim_profiles`, or `safety_settings`, so there is no
way for the two services to race or diverge on them today.

The dual-authority risk that already exists (S4's OTP/identity secrets,
S5's `cases`/`counsellors` writes) is unchanged by this slice — see those
documents for the full accounting.

**Future cutover requirements**: before any real client is pointed at these
new endpoints, (1) the mobile/web consent and profile-setup UI needs to
actually be built (today's `ConsentScreen.jsx` is disconnected and carries
no scope-level payload — see Phase 11), and (2) a decision is needed on
whether/how the existing `users.consent_given` boolean and the new
`consents` table coexist during a transition (e.g. does registration also
grant `monitoring` in the new table automatically, or does that stay a
separate victim action) — this is explicitly **not decided in this slice**,
recorded here as an open question for whoever plans client cutover.

---

## Phase 10 — API design

Per this task's own guidance and v0.2's public-API conventions (no FastAPI
precedent exists here to mirror, unlike S4/S5's identity/registration
routes):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/consents` | Grant or revoke one consent scope for the authenticated victim. |
| `GET` | `/v1/consents` | Read the authenticated victim's current (most recent per scope) consent state. |
| `GET` | `/v1/victims/me/preferences` | Read the authenticated victim's own profile/preferences. |
| `PATCH` | `/v1/victims/me/preferences` | Partially update the authenticated victim's own profile/preferences. |
| `GET` | `/v1/victims/me/safety-settings` | Read the authenticated victim's own safety settings (booleans for secrets, never hashes/plaintext). |
| `PATCH` | `/v1/victims/me/safety-settings` | Partially update the authenticated victim's own safety settings. |

No `/api` prefix and no `/auth` grouping — a deliberate departure from S4/S5's
`/api/v1/auth/*` shape, which was chosen specifically to mirror an existing
FastAPI path. There is no equivalent FastAPI path here to mirror, so v0.2's
own convention (`/v1/...`) is followed directly, per this phase's explicit
instruction not to blindly copy the FastAPI URL structure where it
conflicts with v0.2. No additional endpoints were invented beyond this
table (e.g. no separate "list consent scopes" endpoint, no dedicated
verify-duress-PIN endpoint — see Phase 6 for why).

---

## Phase 11 — Frontend/mobile

**No frontend or mobile files were modified in this slice.** All new tests
exercise Node's HTTP API directly via `supertest`; no client integration was
required to test any of this slice's functionality. `ConsentScreen.jsx`
remains disconnected exactly as found (Phase 1) — reconnecting it (and
giving it real per-scope, per-language content) is future client work, not
attempted here, per "do not redesign the UI" and "only modify
frontend/mobile if strictly required." No duplicate client-side
authentication mechanism was introduced — these endpoints reuse the exact
same `Authorization: Bearer <victim_session token>` scheme already
established in S4, verified by the same `VictimAuthGuard`.

---

## Phase 12 — Tests added

**Unit** (`FakePrismaService`-backed, extended with `consent`/
`victimProfile`/`safetySetting` delegates):

- `src/consent/consent.service.spec.ts` — 6 tests: correct server-side hash
  per scope, all 7 scopes produce distinct hashes, append-only history (not
  update-in-place), "current state = most recent row" semantics, absent
  scopes never fabricated, cross-victim isolation.
- `src/profile/profile.service.spec.ts` — 5 tests: all-null default for a
  never-set profile, upsert-on-first-write, PATCH semantics (partial
  updates preserve other fields), safe-windows storage, cross-victim
  isolation.
- `src/safety/safety.service.spec.ts` — 11 tests: all-false/null default,
  Argon2id hashing for both duress PIN and safe word (format-checked via
  `/^\$argon2id\$/`), hash/plaintext never present in any returned view,
  correct/incorrect PIN verification, safe failure (not an error) when no
  PIN is set, **PIN/safe-word never logged** (spies on every `Logger`
  method and asserts the raw values never appear), cross-victim isolation
  for both settings and PIN verification, trusted-contact round-trip, PATCH
  semantics.

**Integration** (`test/onboarding.integration-spec.ts`, real disposable
PostgreSQL via `test/pg-harness.ts`, 22 tests over real HTTP): migration
additivity (greps the actual migration file, comments stripped, for
destructive statements) and clean application; consent grant, unauthenticated
rejection, exact-hash verification (including proving a client-supplied
`textVersionHash` field has no effect), multiple scopes, cross-victim
consent-history isolation, unknown-scope rejection; profile read/update,
cross-victim isolation (including a direct database check), invalid-data
rejection, unauthenticated rejection; safety settings configuration,
plaintext-never-returned, database-level hash verification, real
Argon2id verify (correct/incorrect), cross-victim PIN isolation, cross-victim
write isolation, trusted-contact round-trip, invalid PIN format rejection,
unauthenticated rejection.

**Preserved, not modified**: all 51 prior Node unit tests, both prior Node
integration suites (S4's 9 + S5's 8), and all 89 existing Python tests.

---

## Phase 13 — Security audit

Full-repository search performed for each category the task lists.
Classification key: **SAFE** (verified correct), **FALSE POSITIVE**
(matched the search but isn't the issue), **REQUIRES FIX** (a genuine S6-
scope issue, fixed below), **DEFERRED** (a genuine issue, but outside this
slice's scope — documented, not silently ignored).

| Category | Occurrences found | Classification |
|---|---|---|
| `victim_id`/`user_id` accepted as authoritative client input, anywhere in `apps/core-api/src` | None — every S6 DTO (`GrantConsentDto`, `UpdatePreferencesDto`, `UpdateSafetySettingsDto`) was checked field-by-field; none has a user/victim-id field. All three controllers resolve identity exclusively via `@Victim()` from `VictimAuthGuard`. | **SAFE** |
| Plaintext PIN storage | None — `duressPinHash`/`safeWordHash` are always the output of `argon2Hash(...)`, verified by a unit test that reads the fake DB row directly and asserts it does not equal the input and matches `/^\$argon2id\$/`, and an integration test that queries the real Postgres column directly. | **SAFE** |
| Plaintext PIN logging | Zero `Logger`/`console` calls exist anywhere in `safety.service.ts` or `safety.controller.ts` at all (confirmed by direct grep) — there is no log statement that could reference the PIN even by mistake. A unit test additionally spies on every `Logger` method during a PIN/safe-word update + verify and asserts neither value appears in any logged text. | **SAFE** |
| `consent=true` hardcoding | Four sites found, **all pre-existing, all outside `apps/core-api`**: `mobile/src/screens/RegisterScreen.jsx:41`, `frontend/src/pages/Login.jsx:111`, `backend/api/intake/ivr_webhook.py:31`, `backend/api/intake/sms_webhook.py:41`. | **DEFERRED** — these are FastAPI/client code this slice does not touch (Phase 9: FastAPI stays untouched this milestone). Fixing them means either wiring a real consent UI into two clients or changing FastAPI's registration/webhook behavior, both of which are cutover-scale changes belonging to a later milestone, not a Node-side extraction slice. Documented here so they are not forgotten. |
| Unrestricted profile updates | None — `ProfileController`'s class-level `@UseGuards(VictimAuthGuard)` covers both `GET` and `PATCH`; confirmed structurally (grep) and behaviorally (integration test: unauthenticated request to both routes returns 401). | **SAFE** |
| Unrestricted safety updates | None — same guard pattern, same structural + behavioral confirmation for `SafetyController`. | **SAFE** |
| Cross-victim access | None found in new code — every service method takes `userId` as an explicit parameter sourced only from the controller's `@Victim()` value, and every query filters by it (`where: { userId }`). Proven negatively in both unit and integration suites (two victims, asserting neither's data/PIN/consent ever crosses into the other's). | **SAFE** |
| Hardcoded secrets | None found in `apps/core-api/src` (grepped for API-key/secret/password patterns and known provider key shapes). | **SAFE** |
| (Incidental, found while auditing consent) `granted: true`/`consent_given` literal in Node source | Only inside `*.spec.ts` test fixtures, which is the correct and expected place for a test to construct an explicit test input. | **FALSE POSITIVE** |

**No genuine S6-scope issue required a fix.** The one class of finding that
would warrant a fix (`consent_given` hardcoding) is entirely in code this
slice's own scope boundaries (Phase 9) explicitly say not to touch.

---

## Remaining gaps after this slice

- Every "Deferred" row in Phase 2's table: crime category (case-domain, not
  profile), the login-PIN-difference check (unenforceable — no login PIN
  exists), live-call duress-PIN behavior (session/agent-svc scope), the
  quick-exit control (client-only), opt-out/purge/retention/legal-hold
  (Phase 8), and v0.2's district-scoped RLS model (Phase 7).
- The four pre-existing `consent_given` hardcoding sites (Phase 13),
  unresolved by design this slice.
- `ConsentScreen.jsx` remains disconnected from any real flow; no client
  today can actually call the new consent/profile/safety endpoints.
- The open question from Phase 9 about how `users.consent_given` and the
  new `consents` table should relate during any future transition.
