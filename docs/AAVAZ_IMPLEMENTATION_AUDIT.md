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
