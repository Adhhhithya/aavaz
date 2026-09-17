# AAVAZ_IMPLEMENTATION_AUDIT.md

Audit of the existing `rithulraveendran/targaryens` codebase (now checked out on branch
`feat/aavaz-integration`) against the authoritative Aavaz v0.2 specification
(`docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf`). This is an inspection document, not a
design document. Every claim below was verified by reading the actual source file named,
not inferred from documentation.

**Update**: at the time this audit was originally written, the spec PDF did not exist
anywhere in this repository (see §10, §14 item 1 as originally written). Per a
subsequent project decision (Decision 6, `AAVAZ_MIGRATION_PLAN.md` §0), the PDF has
since been added to this branch at the path above, copied byte-for-byte from its only
prior location (the unrelated `feat/bootstrap` branch) and left unmodified. The
comparison work in this audit was performed against a full in-conversation reading of
that same PDF throughout, so no findings below change as a result — only the "is the
file present in the repo" gap itself is resolved. See `AAVAZ_MIGRATION_PLAN.md` §0,
Decision 6, for the exact mechanism used.

---

## 1. Existing repository overview

- **Origin**: `rithulraveendran/targaryens`, single branch `main`, 6 commits, single
  author ("Rithul"), all commits dated the same session. No tags, no CI config, no
  issues/PR history to inspect (fetched via plain git, GitHub metadata not queried).
- **What it actually is**: a **Smart India Hackathon (SIH) submission** for Problem
  Statement 26094 (MoSJE) — "AI-Powered Dynamic Mental Health Monitoring and Distress
  Prediction System for Victims of Atrocities." This is a different, earlier-stage
  product than the Aavaz v0.2 target, built for a hackathon demo, not for the
  survivor-safety production system the v0.2 spec describes.
- **Repo-root documentation**: `SYSTEM_SPEC.md` (574 lines — the SIH hackathon's own
  full spec), `COMPLIANCE_AND_PRIVACY.md`, `SETUP_AND_MOBILE.md`, `AGENTS.md` (an
  Antigravity/AI-coding-agent ruleset plus the SIH problem statement text), and a
  polished `README.md`. `mobile/` has its own nested `AGENTS.md` and `CLAUDE.md`
  (1-line, `@AGENTS.md` import) with an unrelated note about Expo v57 API changes.
- **Structure**: `backend/` (Python/FastAPI monolith), `frontend/` (React/Vite web
  dashboards), `mobile/` (Expo/React Native app), `scripts/` (DB seed/admin utilities),
  `.antigravityrules` (coding-standards doc, duplicated inside `SYSTEM_SPEC.md` §3.3).
  **There is no `docs/`, no `ai/`, no `contracts/`, no `infra/`, no `shared/` directory,
  and no Node.js backend of any kind.**

## 2. Existing architecture

The system is a **single-tier Python monolith**, not the Node/Python split the v0.2
spec requires:

```
Web PWA / Mobile app (Expo)          React dashboards (Vite)
        │                                     │
        └───────────────┬─────────────────────┘
                         ▼
              FastAPI backend (backend/main.py)
              - all routes (auth, intake, cases, dashboards)
              - all scoring/LLM calls (Groq, direct)
              - all business rules (assignment, escalation, rules_engine)
              - direct writes to every table
                         │
                         ▼
                  Supabase (Postgres + Auth + Storage)
```

- One FastAPI app (`backend/main.py`) mounts every router directly — auth, intake
  (app/chatbot/IVR webhook/SMS webhook), cases (SOS/lifecycle/eCourts/reports),
  dashboards (counsellor/district/state/national/superadmin). No gateway/core-api/worker
  split; no service-to-service boundary of any kind exists in the code.
- A single in-process `asyncio.create_task()` loop (`escalation.py`) is the entire
  "background jobs" layer — no BullMQ, no Temporal, no Redis, no queue, no persistence
  of scheduled state beyond polling the `sos_events` table every 10 seconds.
- Persistence is Supabase (managed Postgres + Auth + Storage), accessed everywhere via
  a single service-role client (`services/supabase_client.py`) that **bypasses Row-Level
  Security entirely** (RLS policies exist in `scripts/apply_rls.sql` but are irrelevant
  to any request that goes through the backend, since the backend always uses the
  service-role key).
- LLM calls (Groq, `openai/gpt-oss-120b`) are made directly from route handlers and
  services (`services/llm_parser.py`, `services/ecourts_parser.py`,
  `api/intake/sms_webhook.py`) — there is no separate AI service tier, no LangGraph, no
  crisis/output guard abstraction.
- No pgvector, no embeddings, no vector retrieval, no `memory-svc` equivalent anywhere
  in the codebase.

## 3. Existing backend

Verified by reading every route/service/model file in `backend/`:

| Capability | File(s) | Actual behavior |
|---|---|---|
| Health check | `main.py` | `/health` returns static `{"status": "healthy"}` |
| Auth — OTP | `api/auth/auth_routes.py` | `/verify_otp` **never receives or checks an OTP code** — it only checks whether a `phone_number` exists in `users`. No OTP is generated, sent, or validated anywhere in the codebase. |
| Auth — staff login | `api/auth/auth_routes.py` | Real Supabase Auth email/password sign-in; role is read from `users.role_type` after auth succeeds. This one path is genuinely implemented against a real identity provider. |
| Consent | `api/intake/app_routes.py`, `api/intake/ivr_webhook.py`, `api/intake/sms_webhook.py` | `consent_given` is a single boolean on `users`. App registration takes it as a client-supplied flag (never independently verified); IVR and SMS intake **hardcode `consent_given: True`** with comments "implied by IVR interaction for demo" / "implied by texting in". No scope-based consent, no consent text hash, no revocation flow server-side. |
| Registration/profile | `api/intake/app_routes.py` | Real insert into `users`+`cases`; location resolved via `services/location_resolver.py`, which is a **hardcoded mock** returning `"Mock District", "Mock State"` for any coordinates. |
| Case management | `api/cases/case_routes.py`, `case_models.py` | Real CRUD on `cases`/`interactions` via Supabase. |
| CNR/FIR handling | `api/cases/ecourts_routes.py`, `services/ecourts_scraper.py`, `services/ecourts_parser.py` | **Genuinely implemented**, not mocked: calls a real third-party API (`https://webapi.ecourtsindia.com/api/partner/case/{cnr}`) with a bearer token, then uses an LLM (Groq) to clean/structure the response. **Contains hardcoded, CNR-specific data-correction logic for one literal CNR string** (`DLCT110011162019`) with fabricated/asserted case facts (judge names, acts and sections, transfer history) injected unconditionally whenever that CNR is queried — see §12, flagged as a required change. |
| Safety settings (duress PIN, disguise, safe word, quick-exit) | *(none found)* | **Not implemented anywhere.** No matching column, table, route, or UI. |
| Case-manager assignment | `api/assignment/auto_assign.py` | Real: lowest-caseload, language-matched counsellor in a district, with in-memory filtering (not an RPC/SQL query) and a caseload increment on assignment. No caseload cap, no "unassigned task" fallback — falls back to the single lowest-caseload counsellor regardless of language if no match. |
| Scheduling / check-ins | *(none found beyond ad hoc mood check-in)* | `POST /api/v1/intake/app/checkin` logs a single mood value as an `interactions` row with **hardcoded placeholder scores** (`0.5` for everything). No trigger taxonomy, no safe windows, no merge/cool-down rules, no recurring schedule engine of any kind. |
| Sessions / conversation agent | `api/intake/chatbot_routes.py`, `services/llm_parser.py` | Real Groq LLM call for chatbot replies, with conversation history reconstructed from `interactions.transcript_ref` text prefixes (`"User: "`/`"Bot: "` string parsing — no structured message table). No LangGraph, no crisis guard, no output guard; a single hardcoded keyword check (`"help"`/`"scared"` in message text) sets `emotion="fear"`. |
| Assessment/scoring pipeline | `api/scoring/{fusion,predictor,acoustic,sentiment_emotion,engagement}.py` | **All are explicit MVP mocks**, self-documented as such in code comments. `fusion.py`'s `calculate_dynamic_score` is pure keyword matching (`"kill"`, `"rape"`, `"threat"`, `"caste"`, etc. against fixed score/intervention tuples) — despite its docstring claiming an "LLM Fusion Engine," **no LLM call is made in this function**. `acoustic.py`, `sentiment_emotion.py`, `engagement.py` are deterministic stubs with `asyncio.sleep()` calls to simulate latency. |
| Triage/routing | `api/interventions/rules_engine.py` | A single pure function (`get_intervention_recommendation`) mapping score thresholds + emotion tag to a string recommendation. No versioned rules, no engine library, no admin-approval workflow, no SLA timers tied to it. |
| Referrals | *(none found)* | **Not implemented.** No referral table, no state machine, no packet generation, no destination-specific data minimization, no delivery adapters. (`case_type`/`recommended_intervention` fields exist but there is no follow-through workflow.) |
| Audit | *(none found)* | **Not implemented.** No `audit_log` table, no audit writes anywhere in the codebase, despite `COMPLIANCE_AND_PRIVACY.md` describing "heavily access-logged" PII reveals. |
| Oversight/dashboards | `api/dashboards/*.py` | Real Supabase reads returning district/counsellor/case data. **No authentication or authorization check exists on any dashboard route** — see §12 (critical finding). |
| Superadmin | `api/dashboards/superadmin_routes.py` | Generic, **unauthenticated** CRUD over an allow-listed table name, including a `/db/reset` endpoint that deletes all `interactions`/`cases`/`users` rows. No auth dependency, no confirmation, no audit trail. |
| Background workers | `api/assignment/escalation.py` | One `asyncio` loop started on FastAPI startup, polling `sos_events` every 10s for a 30-minute-unresolved condition and marking `escalated=True`. No queue, no durability across restarts, no notification actually sent on escalation (comment: "In a full production system, trigger SMS/Push... here"). |
| PII redaction | `api/scoring/pii_redactor.py` **and** `services/pii_redaction.py` | **Two separate, inconsistent implementations exist.** One is regex-based (phone/email patterns + a hardcoded city-name list); the other is hardcoded literal string replacement (`"Amit Sharma"` → `"[REDACTED NAME]"`, `"9876543210"` → `"[REDACTED PHONE]"`) — the latter only works on the exact demo names/numbers used in `scripts/seed_data.py`. Both are explicitly self-documented as MVP stubs standing in for a real NER pipeline. |
| Report generation | `api/cases/report_routes.py` | Real, working PDF generation via `reportlab` (not Puppeteer as v0.2 assumes). |
| Translation | `services/translation.py` | Mock: two hardcoded Hindi-word substitutions, returns input unchanged otherwise. |

## 4. Existing frontend (React/Vite, `frontend/`)

- Role-based routing (`App.jsx`) for Victim, Counsellor, and three Admin tiers
  (district/state/national), gated by a client-only `ProtectedRoute` component.
- **`AuthContext.jsx` stores whatever object `login()` is called with directly into
  `localStorage`, with no token, no expiry, no server-side session of any kind.**
  `ProtectedRoute` checks `user.role` from that same localStorage object — trivially
  editable by anyone with browser dev tools, and irrelevant anyway since (per §3) the
  backend dashboard routes it's gating access to have no auth checks themselves.
- `Login.jsx` implements both victim OTP-style login (calling the non-verifying
  `/verify_otp` endpoint) and staff login (real Supabase Auth call).
- Victim pages exist for Dashboard, CaseLifecycle, Chatbot, BreathingExercise; Counsellor
  pages for Queue and CaseDetail; Admin pages for District/State/National dashboards —
  all present as files, calling real (but unauthenticated) backend endpoints.
- Stack: React 19, Vite 8, Tailwind 4, Recharts, `react-router-dom` 7. No test files, no
  test runner configured (`package.json` has no `test` script).

## 5. Existing mobile (Expo/React Native, `mobile/`)

- Screens present: Login (phone entry), OTP verification, Register (onboarding),
  Consent, Home, Case Lifecycle, Chatbot, Profile, Breathing exercise, SOS.
- **`ConsentScreen.jsx` exists but is not imported or referenced anywhere in `App.js`'s
  navigation flow — it is dead code.** The actual registration path
  (`RegisterScreen.jsx`) hardcodes `consent_given: true` unconditionally, never showing
  any consent UI to the victim. This directly contradicts `COMPLIANCE_AND_PRIVACY.md`'s
  claim that "the system does not proceed with registration unless `consent_given =
  true`" is a meaningful gate — the gate exists, but consent is fabricated, not captured.
- **OTP verification is entirely client-side theater**: `OTPVerificationScreen.js`
  validates only that 6 digits were typed (including a `__DEV__`-only "auto-fill mock
  OTP" button) and calls `onVerifySuccess(code)` without ever sending the code to the
  backend. `App.js`'s `handleVerifySuccess` then calls `/verify_otp` with only the phone
  number and fabricates a session token client-side: `'mock_jwt_token_' + Date.now()`.
- **SOS is not wired to the backend at all.** `SOSModal.jsx` and `SOSScreen.jsx` are
  fully self-contained UI simulations (local countdown timers, hardcoded demo
  coordinates `28.6139°N, 77.2090°E`); `HomeScreen.jsx` renders `<SOSModal
  onDispatched={() => {}} />` — a no-op. The real backend endpoint
  (`POST /api/v1/cases/sos/sos`) exists (§3) but nothing in the mobile client calls it.
- **Push notifications are entirely mocked.** `services/notifications.js` has the real
  `expo-notifications` implementation fully commented out; the exported function only
  logs `"Mock: Registering for push notifications"`.
- No opt-out control exists anywhere in the mobile UI (no "STOP"-equivalent, no pause
  toggle) despite `COMPLIANCE_AND_PRIVACY.md` describing one.
- `services/api.js` hardcodes `http://10.0.2.2:8000` (Android emulator loopback) as the
  API base URL and attaches no auth header to any request.
- Stack: Expo ~57, React Native 0.86, React Navigation, Reanimated 4, no test setup.

## 6. Existing AI functionality

There is no dedicated AI service tier. What exists is embedded directly in the FastAPI
monolith:

- **Real LLM usage**: Groq (`openai/gpt-oss-120b`) for chatbot replies
  (`llm_parser.py`) and for eCourts data cleanup (`ecourts_parser.py`); an SMS-webhook
  prompt also calls Groq for missing-field prompting. Provider is Groq throughout the
  code, despite `SYSTEM_SPEC.md` specifying Gemini — **documentation and code disagree**.
- **Mocked/simulated**: acoustic analysis (OpenSMILE), sentiment/emotion classification
  (IndicBERT), engagement scoring, and the core distress-fusion scoring function are all
  keyword-matching or deterministic stubs, not real models or real LLM calls, despite
  being described as an "AI-driven... Emotion AI" platform in `README.md`.
- **No crisis guard, no output guard, no LangGraph graph, no memory/retrieval layer, no
  embeddings, no vector store of any kind.** "Crisis" handling is limited to a keyword
  check inside the chatbot route and a score-threshold branch inside
  `rules_engine.py`/`fusion.py`.
- **No legal issue detection or citation system** in the v0.2 sense; the eCourts LLM
  parsing pipeline extracts/normalizes case facts but does not classify legal issues
  against a taxonomy or verify citations.

## 7. Existing infrastructure

- **Database**: Supabase-managed Postgres. No self-hosted Postgres config, no pgvector,
  no `docker-compose.yml`, no Dockerfile anywhere in the repository.
- **Cache/queue**: none. No Redis anywhere in the codebase or dependencies.
- **Object storage**: referenced in `SYSTEM_SPEC.md`/`README.md` (Supabase Storage
  buckets for audio/transcripts) but no code in `backend/` actually uploads to or reads
  from a storage bucket — `transcript_ref`/`audio_ref` fields exist on `interactions`
  but are populated with plain text (e.g. `"User: ..."`) or a webhook-provided URL, not
  written to storage by this codebase.
- **Deployment**: none present — no CI config, no Dockerfile, no IaC, no hosting config
  beyond `frontend/vite.config.js` and Expo's `app.json`. `SETUP_AND_MOBILE.md` describes
  manual local dev setup (ngrok tunnels, `expo start`) only.
- **Secrets/config**: `backend/.env.example` lists `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `BOLNA_API_KEY`, `PUSHBULLET_API_KEY`, `GROQ_API_KEY`,
  `NGROK_URL`, `ECOURTS_API_KEY`. No `.env` or credential was ever committed (verified via
  `git log --all --diff-filter=A --name-only` and a working-tree scan). Frontend/mobile
  have no environment-config mechanism — the mobile API base URL is a hardcoded literal
  in source (§5).

## 8. Existing tests

**None.** No test files, no test framework configuration, and no `tests/` directory
exist anywhere in `backend/`, `frontend/`, or `mobile/`, despite `SYSTEM_SPEC.md` §7
explicitly specifying required unit tests for `fusion.py`, `rules_engine.py`,
`auto_assign.py`, `escalation.py`, and RLS policy tests. `.antigravityrules` / `AGENTS.md`
also mandate these tests. **This is a direct, verifiable gap between the repo's own
documented standards and its actual state.**

## 9. Existing database / data model

`backend/schema.sql` defines: `users`, `counsellors`, `cases`, `interactions`,
`case_updates`, `sos_events` (6 tables, no `applied_interventions` table despite it being
documented in `SYSTEM_SPEC.md` §4.2 — another doc/code mismatch). Notable gaps versus
even the code that queries these tables:

- `cases` in `schema.sql` has no `cnr`, `ecourts_data`, `predicted_escalation_risk`,
  `recommended_intervention`, or `has_sos` columns — yet `ecourts_routes.py`,
  `case_routes.py` (`app_routes.py`'s `get_user_cases`), `chatbot_routes.py`, and
  `counsellor_routes.py` all read or write these fields. **The committed `schema.sql` is
  stale relative to the live Supabase schema** — the real schema has been altered
  out-of-band (via Supabase's dashboard/SQL editor) without updating the file that is
  supposed to be the source of truth for it.
- `interactions.history_score` is `NOT NULL` in `schema.sql` but several insert call
  sites (`chatbot_routes.py`) don't always populate a matching real value, and
  `SYSTEM_SPEC.md` §4.2 lists `final_score` as "history_score removed" — a third
  inconsistency between spec doc, schema file, and actual inserts.
- No `pgvector` extension, no vector columns, no embeddings table.
- Row-Level Security: `scripts/apply_rls.sql` defines `SELECT`-only policies for
  `users`/`cases`/`interactions`/`sos_events`, keyed on `auth.uid()`. As noted in §2,
  these are **moot for all backend-mediated traffic** because the backend always
  connects with the Supabase service-role key, which bypasses RLS. RLS would only matter
  if a client (web/mobile) ever queried Supabase directly with a user-scoped key/token —
  no evidence of that pattern was found in `frontend/` or `mobile/`.

## 10. v0.2 comparison

**Historical note (now resolved — see the update at the top of this document and
`AAVAZ_MIGRATION_PLAN.md` §0, Decision 6)**: at the time this audit was originally
written, `docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf` did not exist anywhere in the
`targaryens` history (confirmed via `git log --all --full-history --diff-filter=A
--name-only`) — the task's premise that the repository "already contains" the spec at
that path was incorrect for the `main` branch as fetched. It existed only on this local
clone's separate `feat/bootstrap` branch and in this assistant's in-conversation reading
of the document supplied directly by the user. All v0.2 comparisons in this document
were made — and remain — based on that full reading of the specification; the PDF's
prior absence from the repo affected discoverability for future sessions, not the
accuracy of the comparisons below.

With that caveat, comparing actual `targaryens` behavior to v0.2:

| Area | v0.2 requirement | targaryens reality | Classification |
|---|---|---|---|
| Service split | Node.js owns domain writes/business rules; Python owns AI only | Single Python monolith owns everything | REQUIRED-CHANGE (fundamental) |
| Node calling LLM | Forbidden | N/A — no Node exists; the only backend calls LLMs directly | REQUIRED-CHANGE (fundamental) |
| OTP | 6-digit, 5-min expiry, 3 attempts, rate-limited, salted-hash phone storage | No OTP is generated or verified at all | REQUIRED-CHANGE (critical security gap) |
| Consent | Per-scope, hashed exact text version, gates outbound contact | Single boolean, hardcoded `true` on IVR/SMS/mobile paths, unused ConsentScreen | REQUIRED-CHANGE |
| Duress PIN / disguise / safe word / quick-exit | Specified in detail (Workflow A6) | Not implemented at all | SPEC-GAP in implementation (missing, not merely different) |
| Lifecycle state machine | 11 states incl. PAUSED/OPTED_OUT/PURGED | 6-stage linear `case_stage` enum (registered→closed), no pause/opt-out/purge states | REQUIRED-CHANGE |
| Case-manager assignment | District+language+lowest caseload, cap, unassigned-task fallback | District+language+lowest caseload implemented; no cap, weak fallback | IMPLEMENTATION-DIFFERENCE (partial match) |
| Scheduling / check-in triggers | 8-type trigger taxonomy, safe windows, merge, cool-down | None — only an ad hoc mood-checkin endpoint | REQUIRED-CHANGE |
| Conversation agent | LangGraph graph, crisis guard, output guard, memory-scoped retrieval | Single LLM call with a keyword-based emotion flag | REQUIRED-CHANGE |
| Assessment/fusion | 3-signal fusion (screener+LLM+rules) with defined never-downgrade/floor logic | Single keyword-matching function; no real signals fused | REQUIRED-CHANGE |
| Legal issue detection | 8-code taxonomy, statute retrieval, citation-verify-or-drop | Not implemented (eCourts parsing exists but does no issue classification) | SPEC-GAP in implementation |
| Triage/routing | 5-level, versioned rules engine, two-admin approval, SLA timers | Single function mapping score→string, no persistence of the decision as a routable task | REQUIRED-CHANGE |
| Referral lifecycle | Full state machine, per-destination minimum-necessary-data, consent gate | Not implemented | SPEC-GAP in implementation |
| Audit logging | Every read of victim content logged, hash-chained | Not implemented | REQUIRED-CHANGE (compliance-critical) |
| RBAC / access control | Role-based, break-glass, RLS-enforced | No server-side authorization on any dashboard/admin route; RLS present but bypassed | REQUIRED-CHANGE (critical security gap) |
| SOS/Critical escalation | 15-min ack / 30-min contact SLA, paging | 30-min-only escalation, in-process poller, no actual notification sent, and not wired to the mobile client at all | REQUIRED-CHANGE |
| eCourts integration | Official data-access arrangement preferred; scraping flagged prototype-only | Real official-looking JSON API integration exists (further along than v0.2 assumed) — but contains hardcoded per-CNR fabricated data | IMPLEMENTATION-DIFFERENCE + NEEDS-DECISION (see §12) |
| Data model | 13 Node tables + 4 Python tables, field-level encryption, RLS | 6 tables, no field-level encryption, schema.sql stale vs. live DB | REQUIRED-CHANGE |
| Deployment/env separation | dev/staging synthetic-only, prod separate | No environment separation; single Supabase project implied throughout | NEEDS-DECISION |
| Observability/model eval | OpenTelemetry, golden-set gates, shadow mode | None present | SPEC-GAP in implementation |

## 11. Missing components (relative to v0.2, not present in any form)

- Node.js service tier entirely (channel-gateway, core-api, workers as specified).
- Duress PIN, app disguise, safe word, quick-exit.
- Referral lifecycle and destination packet generation.
- Audit log table and audit-on-read enforcement.
- Real OTP generation/delivery/verification.
- Scope-based consent capture and consent-changed event propagation.
- Check-in trigger taxonomy, safe windows, scheduling engine (BullMQ/Temporal or
  equivalent).
- LangGraph conversation graph, crisis guard, output guard.
- Memory/retrieval service, embeddings, pgvector.
- Legal issue taxonomy and citation verification.
- Server-side RBAC/authorization on any endpoint (all current auth is either absent or
  purely client-side decoration).
- Push notifications (real implementation).
- Opt-out control.
- Any test suite.
- Any deployment/IaC/CI configuration.

## 12. Conflicts (existing implementation actively incompatible with v0.2, or with its
own documentation)

1. **No Node/Python boundary to preserve or violate — it doesn't exist.** Migrating to
   v0.2 means introducing an entirely new service tier, not adjusting an existing one.
2. **Consent is fabricated, not captured**, contradicting both v0.2 and the repo's own
   `COMPLIANCE_AND_PRIVACY.md`.
3. **OTP verification does not exist**, contradicting both v0.2 and the implicit claim of
   "Secure Access Point" / "Secure Authentication... Supabase Auth (JWT)" in
   `README.md` (that claim is only true for staff login, not victim login).
4. **No authorization on dashboard/admin endpoints**, including an unauthenticated
   `/db/reset`. This is a severe, exploitable gap if this backend were ever exposed
   beyond a local/ngrok demo — it must not be treated as low-priority cleanup.
5. **Hardcoded per-CNR data fabrication in `ecourts_parser.py`** (`DLCT110011162019`):
   the code injects specific judge names, statute sections, and a transfer history
   unconditionally for one real-looking CNR value, mixed with real API data and
   presented identically to legitimately-fetched data downstream (report PDFs, case
   detail views). Regardless of intent (likely a demo-data workaround for an API
   response gap encountered during hackathon prep), this pattern — silently blending
   fabricated legal facts into what looks like verified case data — is exactly the kind
   of fabrication `CLAUDE.md` rule 2 and rule 11 (legal content) prohibit, and it
   directly contradicts the "verified statute citations" and "citation dropped if
   unverifiable" principle in v0.2 §7. **Resolved (decision made, not yet implemented)**:
   Decision 5 in `AAVAZ_MIGRATION_PLAN.md` §0 orders this removed outright, with no
   replacement fake record, and records the full inventory of every code path and UI
   path that reads this data (origin in `ecourts_parser.py`, write path in
   `ecourts_routes.py`, and read paths in `app_routes.py`, `report_routes.py`,
   `CaseLifecycleScreen.jsx`, and `CaseDetail.jsx`).
6. **`schema.sql` does not match the live database schema** actually being queried by
   the code (§9) — the committed migration source is not trustworthy as documentation of
   current state.
7. **Two incompatible PII redaction implementations** coexist, neither of which does
   real redaction — contradicts the repo's own `.antigravityrules` PII-handling
   standard, which both implementations claim to satisfy.
8. **SOS is UI theater on mobile**, not connected to the real backend SOS endpoint —
   contradicts `README.md`'s "Escalation & Intervention: Automatically flags high-risk
   cases... immediately notifying assigned counselors" claim.
9. **LLM provider named in `SYSTEM_SPEC.md` (Gemini) does not match the LLM provider
   actually used in code (Groq)** in every instance checked.

## 13. Required refactors (to move toward v0.2, assuming that direction is confirmed)

- Introduce a genuine Node.js service tier (`channel-gateway`, `core-api`, `workers`)
  that owns all domain writes and business rules; demote the current FastAPI app to an
  AI-only role (or split it into `agent-svc`/`memory-svc`/`analysis-svc`/`speech-svc`),
  removing its direct Supabase writes to domain tables.
- Replace the single Supabase Postgres+service-role-key pattern with a real
  Node-Prisma-owned Postgres (or continue on Supabase's Postgres but stop bypassing RLS
  for anything domain-facing) plus a properly scoped Python data path.
- Build real OTP issuance/delivery/verification and per-scope consent capture from
  scratch — there is no salvageable code here, only the UI shells.
- Add server-side authorization to every existing dashboard/admin/superadmin route
  before this codebase is exposed anywhere beyond a local demo, independent of any
  broader migration timeline — this is a standalone urgent fix, not a deferred refactor.
- Replace the six-stage `case_stage` enum with the v0.2 11-state lifecycle machine, with
  a data migration plan for any real records already using the old enum.
- Rebuild the scoring pipeline as real signals (or explicitly keep mocks but stop
  presenting them as more than that internally) feeding a documented fusion function
  matching v0.2 §7's logic.
- Extract the working eCourts integration (`ecourts_scraper.py`/`ecourts_routes.py`)
  into the Node `workers` court-sync job per v0.2 Workflow B, after removing the
  hardcoded per-CNR fabrication.
- Wire the existing mobile SOS UI to a real, authenticated backend call, and implement
  the escalation SLA timers (15-min ack / 30-min contact) rather than the current
  30-minute-only poller.

## 14. Spec gaps

1. **The v0.2 spec PDF was not present in this repository at audit time — now resolved.**
   Per Decision 6 (`AAVAZ_MIGRATION_PLAN.md` §0), the PDF has been added to this branch
   at `docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf`, copied unmodified from
   `feat/bootstrap`. See the update note at the top of this document.
2. v0.2 does not specify how (or whether) an existing hackathon-stage system should be
   migrated versus rewritten — **resolved by Decision 1** (`AAVAZ_MIGRATION_PLAN.md` §0):
   incremental migration, v0.2-architecturally-authoritative.
3. v0.2 does not address multi-tenant "org-scoped" partner accounts in its data model
   (a gap already recorded in the earlier bootstrap-session `DECISIONS.md` on
   `feat/bootstrap`) — irrelevant to `targaryens` since it has no such concept at all,
   but worth carrying forward into the reconciled plan. **Not addressed by the six
   migration decisions** — remains open for whenever partner/org-scoped accounts are
   actually built.

## 15. Needs-decision items — resolved

The five items originally listed here (plus the spec-gap item in §14.1) have all been
decided by the project owner. Full Decision/Rationale/Consequences/Deferred-work records
live in `AAVAZ_MIGRATION_PLAN.md` §0 — they are not duplicated here to avoid two
divergent copies of the same decision; this section only maps each original open
question to its resolution.

1. **Rewrite vs. incremental migration** → **Decision 1**: incremental migration, v0.2
   architecturally authoritative. (`AAVAZ_MIGRATION_PLAN.md` §0)
2. **Supabase vs. self-hosted Postgres+pgvector** → **Decision 2**: keep Supabase
   initially; specific v0.2 requirements Supabase cannot satisfy natively (managed
   Redis, KMS/envelope encryption, service mTLS) are documented in
   `AAVAZ_MIGRATION_PLAN.md` §7. (`AAVAZ_MIGRATION_PLAN.md` §0)
3. **What happens to the hardcoded `DLCT110011162019` case data** → **Decision 5**:
   remove entirely, no replacement fake record; full code/UI-path inventory recorded.
   (`AAVAZ_MIGRATION_PLAN.md` §0)
4. **Whether the SIH hackathon product surface is retained** → **Decision 4**: preserve
   useful existing UI/product surfaces, refactored as needed; the UI must not constrain
   the backend architecture. (`AAVAZ_MIGRATION_PLAN.md` §0)
5. **Whether to keep Groq or standardize on a different LLM provider** — **not** one of
   the six decisions made in this pass; remains genuinely open, still tracked here and
   in the earlier bootstrap `DECISIONS.md`.

(Existing-data disposition — whether to migrate any current Supabase rows — was also
resolved in this pass, as **Decision 3**, even though it was framed in §6/§9 rather than
as a numbered item here: existing development/hackathon data is disposable by default
unless provenance is established; no migration of existing rows into the v0.2 schema.)

## 16. Security remediation milestone (first code-changing milestone)

This section records the outcome of the first code-changing milestone on
`feat/aavaz-integration`: a scoped security and data-integrity remediation pass, not
architecture migration or new feature work. Full detail (vulnerability inventory,
per-endpoint disposition, tests) lives in code comments and the test suite itself
(`backend/tests/`); this section is a summary index, not a duplicate of it.

### Vulnerabilities fixed

1. **No server-side authorization on any dashboard/admin/superadmin endpoint** (§12
   item 4, §10 "RBAC / access control"). Added a real staff-authorization dependency
   (`backend/api/auth/dependencies.py`) backed by Supabase Auth token verification
   plus `users.role_type` lookup, with role-based (`require_roles`) and
   ownership-based (counsellor-must-own-the-case) checks. Applied to: both
   `counsellor_routes.py` routes, `district_routes.py` (4 routes),
   `state_routes.py`, `national_routes.py`, `superadmin_routes.py` (3 remaining
   routes), `lifecycle_routes.py` (stage update), `report_routes.py` (PDF
   generation), and `case_routes.py`'s `/progress` endpoint (see the dedicated note
   below on why this last one was included).
2. **Unauthenticated destructive `/db/reset` endpoint** (§12 item 4). Removed
   entirely from the HTTP surface (not gated — deleted). The equivalent
   development-only capability (`scripts/clear_db.py`, a pre-existing CLI script,
   not an HTTP endpoint) now refuses to run unless `ENVIRONMENT=development`,
   checked before any database call.
3. **Fabricated per-CNR legal data** (§12 item 5). Removed the
   `if cnr == "DLCT110011162019":` block and its unconditional fake judge
   name/statute sections/transfer-history injection from
   `backend/services/ecourts_parser.py` entirely — not replaced with another
   specific CNR or realistic-looking fixture. Also replaced a residual LLM-prompt
   example that reused the exact same fabricated statute citation
   ("The Prevention of Corruption Act 1988 - Sections 13(2), 13(1)(d)") with a
   generic, non-specific format placeholder, removing a subtle anchoring risk that
   would have survived the primary fix.
4. **Broken staff login (`/api/v1/auth/login`)**: `supabase.auth.sign_in_with_password(...)`
   was called without `await` on an async client, so every staff login attempt
   silently failed (misreported as "Invalid credentials"). Fixed as a one-line,
   directly-related correction — the new staff authorization added in this same
   pass is unusable by any legitimate staff member without it. Verified against the
   real installed `supabase-py` client's method signatures (confirmed
   `sign_in_with_password` and `get_user` are both coroutines), not merely inferred.
5. **Missing runtime dependency** (`reportlab`, used unconditionally by
   `report_routes.py` but absent from `requirements.txt`): a fresh install per the
   committed `requirements.txt` could not import `main.py` at all. Added to
   `requirements.txt` (discovered while setting up a test environment for this
   exact file's changes).

### Endpoints protected (role required; ownership check where applicable)

| Endpoint | Roles allowed | Ownership check |
|---|---|---|
| `GET /api/v1/dashboards/counsellor/queue/{counsellor_id}` | counsellor, district/state/national_admin, super_admin | counsellor must be `counsellor_id` |
| `GET /api/v1/dashboards/counsellor/case/{case_id}` | same | counsellor must be assigned to the case |
| `GET /api/v1/dashboards/district/{district}/{stats,cases,sos,counsellors}` | district/state/national_admin, super_admin | none (no per-district scoping field exists in the data model — residual gap, see below) |
| `GET /api/v1/dashboards/state/stats` | state/national_admin, super_admin | n/a |
| `GET /api/v1/dashboards/national/stats` | national_admin, super_admin | n/a |
| `GET/DELETE/POST /api/v1/dashboards/superadmin/tables/...` | super_admin only | n/a |
| `POST /api/v1/dashboards/superadmin/db/reset` | **removed entirely** | n/a |
| `POST /api/v1/cases/{case_id}/stage` | counsellor, district/state/national_admin, super_admin | counsellor must be assigned to the case |
| `GET /api/v1/cases/{case_id}/report` | same | same |
| `GET /api/v1/cases/{case_id}/progress` | same | same — **see note below** |

**Deliberate, documented tradeoff on `/cases/{case_id}/progress`**: this endpoint is
called by both the counsellor dashboard (`CaseDetail.jsx`) and the victim mobile
app's own dashboard. It previously had no authorization at all — an IDOR letting
anyone view any case's full interaction history and scores by guessing a UUID.
Because there is no real victim authentication mechanism yet (OTP verification is
not implemented), there is no way to distinguish "the victim viewing their own
case" from "an attacker guessing a UUID." Closing the IDOR took priority: this
endpoint is now staff-only, and the victim mobile dashboard's call to it will
return 401 until real victim session issuance exists (tracked as future work in
`AAVAZ_MIGRATION_PLAN.md`, not part of this milestone).

**Victim-facing endpoints deliberately left unchanged** (registration, OTP
"verification", check-in, chatbot, SOS trigger, eCourts search): these have no real
caller-identity mechanism to authorize against, and building one is separate,
larger feature work explicitly out of this milestone's scope. Leaving them
unauthenticated is a known, carried-forward gap, not an oversight — see "Remaining
security gaps" below.

### Fabricated-data paths removed

Full dependency trace (established by direct source search before any change was
made, per the task's instruction to trace before modifying):
- **Origin**: `backend/services/ecourts_parser.py::parse_unstructured_case_data` —
  removed.
- **Write path**: `backend/api/cases/ecourts_routes.py` (`POST /api/v1/ecourts/search`)
  — unchanged code, now simply persists only genuinely-parsed data since the origin
  no longer fabricates anything.
- **Read paths** (unchanged code, now safe because the origin is fixed):
  `backend/api/intake/app_routes.py` (`get_user_cases`), `backend/api/cases/report_routes.py`,
  `mobile/src/screens/CaseLifecycleScreen.jsx`, `frontend/src/pages/Counsellor/CaseDetail.jsx`.

No replacement CNR or realistic-looking fixture was introduced anywhere. Test
fixtures use `"TEST-CNR-001"`, a value that does not match the real CNR format
(`^[A-Z]{4}[0-9]{12}$`), specifically so it cannot be confused with a real one.

### Tests added

`backend/tests/` (new; no test suite existed before this pass): 41 tests across
`test_auth_dependencies.py`, `test_dashboard_authorization.py`,
`test_db_reset_removed.py`, `test_ecourts_fabrication_removed.py`. All 41 pass,
executed against the real application (`main.app`) and the real
`ecourts_parser.py` module, not fakes/rewrites of them. Test infrastructure
(`pytest.ini`, `requirements-dev.txt`) added since none existed; this satisfies the
milestone's "use the repository's existing framework if one exists" instruction by
using pytest — the standard default for a FastAPI codebase — since no competing
framework was already chosen.

### Remaining security gaps (found, deliberately not fixed in this pass)

1. ~~No caller-identity verification on any victim-facing endpoint~~ — **RESOLVED
   in S2** (§17 below): real OTP-backed victim sessions now gate registration,
   check-in, cases, chatbot, SOS, and eCourts search.
2. **No shared-secret verification on IVR/SMS webhooks** — **PARTIALLY ADDRESSED
   in S2** (§17 below): a generic shared-secret check now exists on both
   webhook routers, but it is explicitly an interim mechanism, not either
   provider's real signature scheme (neither is known/available in this repo).
   Still needs replacing with real Bolna/Pushbullet verification once that
   information/credentials exist.
3. **No per-district scoping for `district_admin`**: the data model has no field
   recording which district a given admin is scoped to, so any `district_admin`
   can query any district's dashboard. Fixing this needs a schema change
   (new-feature-shaped work), out of scope here; role-gating (this pass) is a real
   improvement over zero authorization but is not full least-privilege enforcement.
   **Still open after S2** — unrelated to victim identity.
4. ~~`ecourts_routes.py`'s `/search` accepts an arbitrary `user_id` with no
   ownership check~~ — **RESOLVED in S2** (§17 below): the endpoint now requires
   a victim session and always attaches the result to the authenticated victim,
   ignoring any client-supplied id.
5. ~~SOS trigger has no authentication~~ — **RESOLVED in S2** (§17 below): now
   requires a victim session and verifies the target case belongs to that
   victim. The mobile SOS UI still doesn't call this endpoint at all (pre-existing,
   confirmed dead in S1) — that integration gap is unchanged and documented in §17.
6. **`@app.on_event("startup"/"shutdown")` in `main.py` is deprecated** in the
   FastAPI version this repo resolves to when installed unpinned (surfaced as a
   `DeprecationWarning` during test-suite verification for this milestone) — not a
   security issue, not fixed here, noted for future dependency-hygiene work.
7. **No dependency version pins anywhere in `requirements.txt`**: installing it
   fresh can silently pull a materially different major version of `fastapi` (and
   therefore `starlette`) than whatever was last tested against. This is exactly
   how the verification environment for this milestone briefly broke (see the
   equivalent note in the session's operational record) — recommend pinning at
   least `fastapi` and `starlette` in a future pass, though doing so here would
   have expanded this milestone's scope beyond the five listed issues.

## 17. S2 milestone: Victim Authentication and Identity

This section records the outcome of the second code-changing milestone: a real
victim OTP + identity boundary, replacing the phone-existence-check-only
"verification" traced in Phase 1 of this milestone. Still no Node.js extraction,
no AI-service work, no scheduling/referral engine — those remain out of scope.

### Phase 1 finding: what the existing "authentication" actually did

Traced before any code changed, exactly as the milestone required:

- **Phone representation**: plaintext in `users.phone_number` (`TEXT UNIQUE NOT
  NULL`). No hashing/encryption at rest. Out of scope to change in S2 (see
  "Deliberately not changed" below) — a bigger, separate migration.
- **OTP generation**: none existed. `POST /api/v1/auth/verify_otp` only checked
  whether `phone_number` already existed in `users` and returned `is_new_user`.
  No code was ever generated, sent, or stored.
- **OTP provider**: none configured or coded. `services/pushbullet` SMS sending
  was itself a stub (`sms_webhook.py` only ever logged what it would send —
  "Mocking the actual HTTP call to pushbullet for brevity").
- **OTP state storage**: none — there was nothing to store.
- **Expiry / attempt counting / rate limiting**: none — there was no code to
  expire, no attempts to count.
- **Supabase Auth usage**: real, but staff-only (`/api/v1/auth/login`, email +
  password). Victims are not Supabase Auth users at all — only a `users` table
  row keyed by phone number.
- **Staff vs. victim auth**: staff auth (S1) is Supabase-issued and
  remote-verified (`supabase.auth.get_user(token)`); victims had no
  server-verified identity of any kind before S2.
- **Victim identity in requests**: every "victim-facing" endpoint took
  `user_id`/`victim_id` directly as a request/path/body parameter, fully
  client-controlled, with no cross-check against anything (see S1's audit §12
  item 4's category and this milestone's own Phase 4 findings below).
- **Frontend/mobile OTP submission**: neither client sent the typed OTP digits
  to the backend at all. Mobile's `OTPVerificationScreen.js` only checked
  `code.length === 6` locally, including a `__DEV__`-only "auto-fill mock OTP"
  button; the web `Login.jsx` had the identical pattern. Both then called
  `verify_otp` with only the phone number.
- **Session/token mechanism**: none for victims. Mobile fabricated a client-side
  string (`'mock_jwt_token_' + Date.now()`); web stored a plain `user` object in
  `localStorage` with no token field at all. Neither client ever attached an
  `Authorization` header to any subsequent request (confirmed by direct source
  inspection of every fetch/api call site in both clients).

### OTP implementation

New module `backend/services/otp_service.py` + `backend/services/otp_providers.py`,
backed by a new `otp_codes` table (`backend/migrations/0002_otp_codes.sql`,
additive only — see "Database changes" below):

- 6-digit code via `secrets.randbelow` (cryptographic RNG, not `random`).
- 5-minute expiry (`OTP_TTL_SECONDS`, configurable, spec-matching default).
- Max 3 attempts (`OTP_MAX_ATTEMPTS`), enforced server-side per stored row.
- Rate limiting per phone (default 5/15min) and per IP (default 20/15min),
  enforced by counting recent rows in `otp_codes`.
- Only a salted HMAC-SHA256 hash of the code is ever stored (`code_hash` +
  per-row `salt`); the plaintext code exists only transiently inside
  `request_otp()`'s local scope and the one call to the delivery provider.
- Verification uses `hmac.compare_digest` (constant-time) — see Phase 11.
- A verified code is marked `consumed_at` and cannot be replayed.
- Provider abstraction (`OtpProvider`): `SyntheticOtpProvider` (refuses
  construction outside `ENVIRONMENT=development`; logs the code with a
  `[DEV ONLY]` prefix) and `PushbulletOtpProvider` (real HTTP call to
  Pushbullet's texts API — **UNVERIFIED against a live account**, no
  credentials were available; flagged explicitly in code and here per the
  instruction not to claim untested integrations work). `get_otp_provider()`
  fails closed (raises) if neither a real provider nor a development
  environment is available — it never silently falls back to the synthetic
  provider outside development.
- Phone numbers are hashed (HMAC-SHA256 + a server pepper, `OTP_PEPPER`) for
  the `otp_codes` lookup key only — **this does not change how
  `users.phone_number` itself is stored**, which remains plaintext (see
  "Deliberately not changed" below).

### Identity/session mechanism

New module `backend/api/auth/victim_dependencies.py`. Victims are **not**
provisioned as Supabase Auth users in this pass (no live SMS-provider
credentials to configure Supabase's own phone-auth flow, and doing so would
mean giving every victim a Supabase Auth account for a system that otherwise
identifies them by phone + a `users` row) — instead:

- A self-issued, HS256 JWT (our own secret, `VICTIM_SESSION_SECRET` — distinct
  from Supabase, verified locally, no network call) with two distinct,
  non-interchangeable purposes:
  - `phone_verified`: proves OTP success for a phone number; authorizes
    exactly one thing — `POST /api/v1/intake/app/register`. Cannot be used as
    a session (tested explicitly — see Phase 8/§17 tests below).
  - `victim`: a full session scoped to one `users.id`; required on every other
    victim-facing endpoint.
- `get_current_victim` dependency resolves `authenticated principal → victim_id`
  from this token — never from a client-supplied parameter.
- For the one endpoint both staff and victims call
  (`GET /api/v1/cases/{case_id}/progress`, S1's documented dual-consumer),
  `get_case_access_principal` tries the victim-token decode first (cheap,
  local), then falls back to S1's Supabase staff verification — a
  forged/garbage token fails both paths and is rejected with 401.

### Victim endpoints protected (Phase 4 audit + fix)

| Endpoint | Was | Now |
|---|---|---|
| `POST /api/v1/auth/otp/request` (replaces `/verify_otp`) | Public, no-op OTP | Public (necessarily — it's the entry point); rate-limited |
| `POST /api/v1/auth/otp/verify` (replaces `/verify_otp`) | Public, checked only phone existence | Public; real verification; issues `phone_verified` or `victim` token |
| `POST /api/v1/intake/app/register` | Public, trusted client-supplied `phone_number` | Requires `phone_verified` token; phone derived from it, not the body |
| `POST /api/v1/intake/app/checkin` | Public, trusted client-supplied `user_id` | Requires victim session; `user_id` removed from the body entirely, derived from token |
| `POST /api/v1/intake/app/cases` | Public, trusted client-supplied `user_id` | Requires victim session; same |
| `GET /api/v1/intake/app/cases/{user_id}` | Public, no ownership check (IDOR) | Requires victim session; `user_id` path param verified == caller |
| `POST /api/v1/intake/chatbot/message` | Public, trusted client-supplied `user_id` | Requires victim session; `user_id` removed from the body |
| `GET /api/v1/intake/chatbot/history/{user_id}` | Public, no ownership check (IDOR) | Requires victim session; verified == caller |
| `POST /api/v1/cases/sos/sos` | Public, no ownership check | Requires victim session; case ownership verified before an SOS event is created |
| `POST /api/v1/ecourts/search` | Public, trusted client-supplied `user_id` (S1 gap 4) | Requires victim session; result always attached to the authenticated victim |
| `GET /api/v1/cases/{case_id}/progress` | Staff-only (S1 tradeoff) | Staff (unchanged) **or** the victim who owns the case |

**Not found / not built** (per Phase 4's "at minimum inspect" list): a dedicated
victim profile or preferences endpoint does not exist — `ProfileScreen.jsx`
only ever updated local `AsyncStorage`, never the backend, both before and
after this milestone. An opt-out endpoint does not exist. A "sessions" concept
(conversation sessions distinct from ad hoc chatbot messages) does not exist.
Building any of these would be new feature work, not an auth-boundary fix, so
none were added — consistent with "do not implement new AAVAZ features."

### eCourts ownership fix (Phase 5)

`CNRSearchRequest.user_id` was removed from the Pydantic model entirely (not
just ignored) — a client cannot even attempt to supply it anymore without the
extra field being silently dropped. The case created from a search is always
attached to `current_victim.id`, resolved from the victim session. Tested
explicitly: a request with `{"cnr": "...", "user_id": "<someone else>"}` results
in a case owned by the authenticated caller, never the supplied id. S1's staff
authorization on every other endpoint is untouched (see "Testing" below —
all 55 pre-existing S1 tests still pass unmodified).

### SOS authentication status (Phase 6)

`POST /api/v1/cases/sos/sos` now requires a victim session and verifies
`case.user_id == current_victim.id` before creating an `sos_events` row —
identity binding only, exactly as scoped. No change to escalation logic, no
emergency-service contacting behavior, no operating-agency policy invented.
**Residual, pre-existing, unchanged gap**: the mobile app's SOS UI
(`SOSModal.jsx`, `SOSScreen.jsx`) still never calls this endpoint at all — it
was confirmed dead/UI-only in the original audit and remains so. Wiring it up
would be new functional integration work (deciding what the UI does with a
real dispatch result), not "consuming the existing auth flow" (there is no
existing call to adapt), so per Phase 10's own instruction this is documented
as an integration gap rather than worked around.

### IVR/SMS webhook status (Phase 7)

Neither Bolna's nor Pushbullet's real webhook authentication mechanism is
documented, configured, or available anywhere in this repository, and no
credentials existed to look one up against a live account. Per the explicit
instruction not to invent a provider signature algorithm, S1's generic
shared-secret interim mechanism (`api/auth/webhook_auth.py`) is what's in
place — unchanged in kind from S1, just re-confirmed here. It fails closed
(503) outside development if no secret is configured, and rejects (401) a
wrong/missing secret when one is. **This is explicitly not "provider webhook
security is complete"** — it's a generic gate, not Bolna's or Pushbullet's own
verification. Tests exist for the mechanism that is actually implemented
(`backend/tests/test_webhook_auth.py`), not for a fabricated vendor scheme.

### Database changes (Phase 9)

One new, additive table: `otp_codes` (`backend/migrations/0002_otp_codes.sql`).
No existing table was altered, renamed, or dropped. `schema.sql` was not
assumed to reflect the live schema (per S1's own finding that it's already
stale) — this migration only depends on the `uuid_generate_v4()` extension
already required by every other table. Not applied to any live database as
part of this change; apply it the same way `schema.sql`/`apply_rls.sql` are
applied today (Supabase SQL editor), before relying on the OTP endpoints in
that environment. RLS enabled on the new table with no permissive policies, as
defense-in-depth (the app only ever accesses it via the service-role key, same
as every other table today).

### Deliberately not changed (documented, not silent)

- **`users.phone_number` remains plaintext.** The spec's "salted hash for
  lookup plus an encrypted value for outreach" phrasing applies to the
  *primary* phone storage; migrating that column's format is a bigger, riskier
  change touching every existing consumer (staff lookups, SMS webhook, seed
  scripts) and is out of scope for an auth-boundary milestone. Only the *new*
  OTP-specific state (`otp_codes.phone_hash`) is hashed. Flagged as a
  follow-up, not silently skipped.
- **No per-district scoping, no real emergency-contact behavior, no
  scheduling/referral engine** — all explicitly out of this milestone's scope
  per the task itself.

### Frontend/mobile changes (Phase 10)

Functional wiring only — no visual/layout changes, no new design system, per
the explicit instruction. Both clients had the identical broken pattern
(fake OTP, no auth header ever sent), so both were updated symmetrically:

- **Mobile** (`App.js`, `OTPVerificationScreen.js`, `RegisterScreen.jsx`,
  `HomeScreen.jsx`, `CaseLifecycleScreen.jsx`, `ChatbotScreen.jsx`,
  `services/api.js`): wired `otp/request` → `otp/verify` → (register-with-token
  | direct session), added `setAuthToken`/`clearAuthToken` to `api.js` so every
  subsequent call attaches `Authorization: Bearer <token>`, removed the
  now-nonfunctional `__DEV__` auto-fill-OTP button (a hardcoded code cannot
  succeed against real verification), removed `user_id`/`phone_number` from
  request bodies that no longer accept them.
- **Web** (`AuthContext.jsx`, `Login.jsx`, `Victim/Dashboard.jsx`,
  `Victim/Chatbot.jsx`): same OTP flow wiring; `AuthContext` now stores a
  `token` alongside the user object and exposes an `authFetch` helper; victim
  pages migrated to it. Also fixed staff login discarding
  `access_token` entirely (a one-line, directly-related completion of S1's own
  authorization work — without it no staff request could ever have been
  authenticated after login, which would have made S1's dashboard fixes
  permanently unusable from this client).
- **Incidental bug fixed while wiring**: `Victim/Dashboard.jsx` was calling
  `GET /api/v1/cases?user_id=...`, an endpoint that has never existed in this
  backend (`case_routes.py` only ever exposed `/{case_id}/progress`). Corrected
  to the real endpoint (`GET /api/v1/intake/app/cases/{user_id}`) while
  wiring auth through this exact call.
- **Integration gap documented, not worked around**: mobile SOS UI still does
  not call the backend at all (see "SOS authentication status" above).

### Testing (Phase 8)

89 tests total (55 pre-existing S1 tests, unmodified, all still passing + 34
new): `test_otp_service.py` (14), `test_victim_identity.py` (9),
`test_victim_authorization.py` (11, including cross-victim IDOR checks using
real signed tokens for victim A/B), `test_webhook_auth.py` (10, superseding
the equivalent count noted in S1 since the mechanism is now fully exercised).
A new `tests/fake_supabase.py` in-memory query-builder fake was built so OTP
hashing/expiry/attempt/rate-limit logic could be genuinely exercised (real
module code, not a rewritten copy) without a live Supabase project. Covers
every case in the milestone's Phase 8 list: valid/invalid/expired/reused OTP,
4th-attempt rejection, no-plaintext-in-logs-or-responses, phone+IP rate
limiting, session establishment, server-side identity resolution, cross-victim
denial on profile/case/chat-history/eCourts/SOS, unauthenticated rejection,
and all pre-existing S1 staff-authorization tests passing unchanged.

### Remaining security gaps after S2

1. `users.phone_number` still plaintext (see "Deliberately not changed").
2. IVR/SMS webhook auth is still a generic interim shared-secret, not either
   provider's real signature scheme (unchanged from S1, re-confirmed here).
3. No per-district scoping for `district_admin` (unchanged from S1).
4. `PushbulletOtpProvider` is unverified against a live account — the only way
   to confirm it works is to test it with real credentials, which were not
   available while writing it.
5. Mobile SOS UI remains disconnected from the (now-authenticated) backend
   endpoint.
6. ~~Web staff dashboard pages (`DistrictDashboard.jsx`, `CaseDetail.jsx`) do
   not yet use `authFetch`~~ — **RESOLVED in S3** (§18 below).
7. Verification of this entire flow end-to-end against a live Supabase project
   was not possible in this environment (no credentials) — **still true after
   S3** (§18 below records exactly what additional verification *was* done:
   real PostgreSQL schema/query verification, which is a genuine but partial
   substitute — it proves the migration and SQL semantics, not Supabase Auth
   or PostgREST behavior).

## 18. S3 milestone: authentication hardening/verification pass

Final pre-migration pass: (A) verify what's actually verifiable without live
Supabase credentials, (B) close the staff dashboard auth-wiring gap left open
at the end of S2, (C) one more repository-wide audit before the Node.js
architecture work begins. No backend authorization behavior was weakened or
changed in this milestone — only frontend wiring and verification work.

### A. Live development authentication verification

**No Supabase project credentials exist anywhere in this environment** —
confirmed by checking for `backend/.env` (absent) and any other non-example
`.env` file in the repository (none). Per the task's own framing ("If the
environment already has valid development credentials configured...") this
condition is not met, so **the full registration → OTP → session →
victim-scoped-request flow was NOT run against a live Supabase project.**
Claiming otherwise would violate the explicit instruction not to claim live
verification that wasn't performed.

**What running it for real would require**: `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` for a development Supabase project, with
`backend/schema.sql` and `backend/migrations/0002_otp_codes.sql` applied to
it (Supabase SQL editor, per the existing README-documented workflow), plus
`OTP_PEPPER` and `VICTIM_SESSION_SECRET` set to real random values (or left
unset with `ENVIRONMENT=development`, which uses the explicitly-labeled
insecure dev fallback — never in a real Supabase project, since that
project's data would no longer be purely local/throwaway).

**What was actually, genuinely verified instead** (not a substitute for the
above, but real verification of the parts that don't need a live Supabase
project specifically):

- **The migration and its exact SQL semantics were run against a real
  PostgreSQL 17 engine** — not Supabase itself, but the same database engine
  Supabase runs. A fully isolated, throwaway `initdb` cluster was created in
  the session's scratch directory on port 55432 (never touching the user's
  own running PostgreSQL service on port 5432, verified untouched throughout
  and after). `backend/schema.sql` then `backend/migrations/0002_otp_codes.sql`
  were applied in order; both succeeded with zero errors. The resulting
  `otp_codes` table, its three indexes, and RLS-enabled/no-policies state were
  inspected directly (`\d otp_codes`) and matched the migration exactly. All
  six pre-existing tables (`users`, `cases`, `interactions`, `counsellors`,
  `sos_events`, `case_updates`) were confirmed present and unmodified.
  Real INSERT/SELECT/UPDATE statements reproducing `otp_service.py`'s exact
  query shapes (phone-scoped lookup with `purpose`/`consumed_at IS
  NULL`/`ORDER BY created_at DESC LIMIT 1`, attempt increment, consumption,
  the "cannot be reused" re-query, and the rate-limit recency count) were run
  with synthetic-only data (`+910000000000`, dummy hex hash values, "Synthetic
  Test Victim") and produced exactly the expected results, including the
  reused-code query correctly returning zero rows after consumption. The
  throwaway cluster was stopped and its data directory deleted afterward —
  nothing was left behind.
- **This is explicitly not equivalent to live Supabase verification.** It
  does not exercise Supabase Auth, PostgREST (the HTTP layer `supabase-py`
  actually talks to), RLS enforcement via Supabase's JWT-claim mechanism, or
  the `PushbulletOtpProvider`'s real HTTP integration. Those remain
  unverified against a live environment, exactly as documented in S2 and
  restated here rather than silently dropped.
- **OTP provider verification result**: `SyntheticOtpProvider` was already
  covered by real (non-fake) unit tests in S2 (construction-time
  environment guard, code delivery via `send_otp`). No live SMS provider
  credentials exist, so `PushbulletOtpProvider` remains **unverified against
  a live account** — unchanged from S2, restated per the instruction not to
  claim it works without running it.
- The full 89-test backend suite (in-memory-fake-backed, per S2) was re-run
  and still passes — see "Testing" below for the exact count after S3's
  additions.

### B. Staff dashboard auth integration

Inspected every page under `frontend/src/pages/Admin/` and
`frontend/src/pages/Counsellor/` (the full staff dashboard set, not just the
two named in the task):

| Page | Makes a real backend call? | Before S3 | After S3 |
|---|---|---|---|
| `Admin/DistrictDashboard.jsx` | Yes | Bare `fetch()`, no auth header, **and** the URL (`/api/v1/dashboards/district`) didn't match any real backend route (`/api/v1/dashboards/district/{district_name}/stats`) — a pre-existing dead call, found while fixing this | Uses `authFetch`; URL corrected to the real route shape; explicit 401 (logout + redirect) and 403 (inline error banner) handling |
| `Counsellor/CaseDetail.jsx` | Yes | Bare `fetch()`, no auth header | Uses `authFetch`; explicit 401 (logout + redirect) and 403 ("You do not have access to this case") handling, distinct from "not found" |
| `Admin/StateDashboard.jsx` | **No** — `setTimeout` with hardcoded mock stats, no fetch of any kind | n/a | **Not changed.** There is no existing call to wire to auth; building one would be new backend-integration feature work (deciding what to fetch, handling the response), not "consuming the existing auth mechanism" — out of this milestone's scope. Not a security gap: no real data is fetched or exposed. |
| `Admin/NationalDashboard.jsx` | **No** — same pattern | n/a | Same as above, not changed |
| `Counsellor/Queue.jsx` | **No** — hardcoded `mockCases` array | n/a | Same as above, not changed |

**Client-side role assumptions**: `App.jsx`'s `<ProtectedRoute
allowedRoles={[...]}>` wrapping is a pre-existing, purely client-side
convenience gate (trivially bypassable by editing `localStorage`) — this was
already true before S1 and remains true; it was **not strengthened or relied
on further** here, consistent with the instruction that the server remains
the sole authority. Nothing in this milestone treats that gate as a security
boundary.

**Identifiers that bypass server authorization**: none found on the two pages
that make real calls — `DistrictDashboard.jsx` never took a client-suppliable
identifier that bypassed anything (its bug was a wrong URL, not a bypass);
`CaseDetail.jsx`'s `caseId` comes from the URL path and was already verified
**server-side** by S1's counsellor-ownership check — the frontend fix here is
about the header/error-handling, not a new authorization decision (the
server was always the authority on this; the frontend just wasn't giving it
a token to authorize with).

**No second authentication mechanism was created.** Both fixed pages use the
exact same `authFetch` helper (`AuthContext.jsx`) already built in S2/S1;
`Login.jsx`'s staff flow (already forwarding `access_token` as of S2) was not
touched again. **No backend authorization was weakened** — no backend file
was modified in this milestone at all; every fix is frontend-only.

**Incidental fix while wiring `AuthContext.jsx`**: `oxlint` surfaced
`react-hooks/exhaustive-deps` warnings on the four `useEffect` hooks now
calling `authFetch`/`logout`/`navigate` inside them (the two pages fixed here
plus the two victim pages fixed in S2, since none of the four had previously
listed a context function as a dependency). Rather than silence the warning,
`login`/`logout`/`authFetch` were wrapped in `useCallback` in `AuthContext.jsx`
so they have stable identities and the affected `useEffect` dependency arrays
were corrected to list them — this is a genuine correctness fix (an unstable
function identity in a dependency array is either a silent lint-suppression
or a real stale-closure/effect-loop risk), not an unrelated refactor; it was
found by tracing the exact files this milestone touched.

### C. Authentication consistency audit (repository-wide)

| Finding | Classification | Notes |
|---|---|---|
| `POST /api/v1/auth/otp/request`, `/otp/verify`, `/login` have no auth dependency | **SAFE** | Correct — these are the entry points; nothing to authenticate yet |
| Every other backend route has a `Depends(...)` auth/identity dependency | **SAFE** | Verified by enumerating every `@router.` decorator against its function signature across the entire `backend/api/` tree — zero gaps found |
| `backend/api/intake/ivr_webhook.py`, `sms_webhook.py` — router-level `dependencies=[Depends(verify_*_webhook)]` | **SAFE** | Covers all 4 routes on those two routers, confirmed by inspection, not just the `/webhook` ones |
| `chatbot_routes.py`'s dead `ChatbotRequest` Pydantic model still has a `user_id: str` field | **FALSE POSITIVE** | Confirmed via repo-wide grep that this class is never imported or referenced by any route — it's pre-existing, unreachable dead code, not a live vulnerability |
| `backend/models/case_models.py`'s `Case`/`SOSEvent` etc. have `user_id`/`case_id` fields | **FALSE POSITIVE** | Confirmed this entire file is never imported anywhere in `backend/api/` or `main.py` — dead, pre-existing response-shape definitions never wired to a route |
| `chatbot_routes.py`'s `ChatMessage.session_id` field | **SAFE / FALSE POSITIVE** | Present in the request body but never read anywhere in the handler for any authorization or lookup decision — inert, not a real identifier the server trusts for anything |
| `app_routes.py`'s `/cases/{user_id}` and `chatbot_routes.py`'s `/history/{user_id}` path parameters | **SAFE** | Verified against `current_victim.id` server-side (S2); a mismatch is rejected with 403 before any data is read |
| `case_routes.py`'s `/{case_id}/progress`, `sos_routes.py`'s `/sos`, `lifecycle_routes.py`'s `/{case_id}/stage`, `report_routes.py`'s `/{case_id}/report`, `counsellor_routes.py`'s `/case/{case_id}` — all take `case_id` | **SAFE** | Every one independently verifies ownership (victim-owns-case or counsellor-assigned-to-case) server-side before returning/mutating anything (S1 + S2) |
| `ecourts_routes.py`'s `/search` — `user_id` field | **SAFE** | Removed from the Pydantic model entirely in S2; cannot be supplied at all, not merely ignored |
| Frontend/mobile `Authorization` header attachment | **SAFE, after S3** | Every call site that hits a protected endpoint now goes through `authFetch` (web) or `api.get`/`api.post` (mobile), both of which attach the bearer token; the 3 public entry-point calls (`otp/request`, `otp/verify`, staff `login`) correctly omit it; `register`'s call correctly uses a one-off `phone_verified` token instead of the ambient session token. Full enumeration performed — see the fetch-call-site grep in this session's working notes. |
| Hardcoded authentication tokens | **SAFE** | Repo-wide search for `mock_jwt`/`fake_token`/hardcoded `Bearer <literal>` found nothing; every `Bearer` occurrence interpolates a real variable |
| Hardcoded OTPs (`123456`, etc.) | **SAFE** | None found in application code; the only `000000`/`123456`-shaped matches are pre-existing null-UUID sentinels in `seed_data.py`/`clear_db.py`, unrelated to OTP |
| OTP values written to logs | **SAFE** | Every `logger.*` call in the OTP code path was individually inspected; only `SyntheticOtpProvider` logs the code, and only when `ENVIRONMENT=="development"` (enforced at construction time, not just by convention) |
| Unauthenticated destructive endpoints | **SAFE** | `/db/reset` remains removed (S1); no new destructive endpoint was added in S2 or S3; `scripts/clear_db.py`'s production guard is unchanged and still covered by its S1 regression test |
| `Admin/StateDashboard.jsx`, `Admin/NationalDashboard.jsx`, `Counsellor/Queue.jsx` render mock data with no backend call | **SAFE (functional gap, not a security gap)** | No real data is fetched, so there is nothing to leak and no auth header to omit; documented in Part B above rather than silently left unmentioned |

No item in this audit required a fix beyond what's recorded in Part B above.

### Testing (Phase D)

18 new tests added, all newly executed and passing, on top of the
already-passing 89 backend tests (unchanged, re-run to confirm no
regression):

- `frontend/tests/staff-dashboard-auth.test.js` (8 tests, Node's built-in
  `node:test` runner — **no new testing framework or dependency added**,
  since none existed for this frontend and Node ships this runner):
  `authFetch` existence/header-attachment, both fixed pages use `authFetch`
  and not a bare `fetch()`, both handle 401/403, staff login forwards
  `access_token`, no fabricated-token pattern remains, and a forward-guard
  that fails loudly if `StateDashboard`/`NationalDashboard`/`Queue` ever gain
  a real backend call without `authFetch`.
- `mobile/src/services/__tests__/api-auth-wiring.test.js` (7 tests, same
  `node:test` runner, deliberately using `fs.readFileSync` text checks rather
  than importing `api.js` as a module — mobile's `package.json` intentionally
  was **not** changed to `"type": "module"` to make direct ESM imports work,
  since that's a package-wide setting that could affect how Node interprets
  any current or future CommonJS tooling script in this Expo project, for a
  benefit limited to this one test file; the risk/benefit didn't justify it):
  token-attachment logic present, both `get`/`post` route through the same
  header builder, the one-off registration-token override exists, no
  fabricated token pattern, and two regression guards that the S2 fix
  removing `user_id` from mobile request bodies hasn't been reverted.
- Both are wired into their respective `package.json` as `"test": "node
  --test"` for discoverability, though `npm test` itself could not be
  exercised in this specific sandboxed environment (see "Verification"
  below) — the underlying test runner was verified directly instead.
- These are explicitly **source-consistency/regression checks, not rendered
  component or behavioral tests** (no React Testing Library, no jsdom,
  because introducing them was judged disproportionate to this milestone and
  is exactly the kind of new testing framework the task said not to add) —
  stated plainly so this isn't mistaken for equivalent-strength coverage to
  the backend's behavioral test suite.

### Database (Phase E)

**Migration was NOT applied to production, and was not applied to any
persistent development database either** — there is no persistent
development Supabase project available in this environment to apply it to.
It was applied to, and verified against, a fully isolated, throwaway local
PostgreSQL 17 instance created solely for this verification and destroyed
immediately afterward (see Part A above for the exact procedure). No
existing table was altered or dropped; the migration is purely additive,
confirmed by inspecting the schema before and after. **Recommendation
unchanged from S2**: apply `backend/migrations/0002_otp_codes.sql` to a real
development Supabase project via its SQL editor (same workflow as
`schema.sql`/`apply_rls.sql`) before relying on the OTP endpoints there.

### Verification actually performed (Phase F)

- **Backend**: full `pytest` suite — 89 passed, 0 failed (unchanged from S2,
  confirmed by re-running, not assumed). `main.app` import/startup check
  re-run successfully.
- **Frontend**: `node --test` (auto-discovery from the frontend root, which
  picks up `tests/staff-dashboard-auth.test.js`) — 8 passed, 0 failed.
  `vite build` run directly via `./node_modules/.bin/vite build`
  after `npm install` (dependencies had never been installed in this
  checkout) — succeeded, 2462 modules transformed, no errors. `oxlint` run
  directly via `./node_modules/.bin/oxlint` — exit code 0, only pre-existing
  and minor informational warnings remain (none introduced by this
  milestone's changes; the `exhaustive-deps` warnings this milestone's own
  changes did introduce were fixed, not suppressed — see Part B).
- **`npm test` / `npm run build` / `npm run lint` (the package-script forms)
  could not be exercised in this specific environment**: invoking them
  through `npm run <script>` fails with `'node' is not recognized`, because
  npm spawns the script via `cmd.exe` on this Windows/Git-Bash setup and that
  subprocess's PATH doesn't include Node, even though `node`/`npm` both work
  fine invoked directly from this session's shell. This is a pre-existing
  environment/PATH characteristic, not a defect introduced by this milestone
  — confirmed by successfully running the exact same underlying commands
  (`node --test`, `vite build`, `oxlint`) directly, bypassing `npm run`.
  Stated explicitly rather than silently claiming `npm test` passed.
- **Mobile**: `node --test` (new test file) — 7 passed. No build/lint/type
  check exists or was attempted (Expo apps aren't "built" the way a web app
  is without a full EAS/native toolchain, and none was already configured in
  this repo — out of scope to add here).
- **Git**: `git status`, `git diff --stat`, and a full `git diff` review were
  performed (see this session's final report for the exact output). No
  secrets, no real victim data, no fabricated case data beyond the
  already-approved synthetic identifiers (`+910000000000`, `TEST-CNR-001`
  style, `VICTIM_A`/`VICTIM_B`), no unrelated refactoring, no Git history
  rewrite, no remote change, no push.
