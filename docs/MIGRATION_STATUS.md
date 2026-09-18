# MIGRATION_STATUS.md

Living tracker of domain migration state. Updated at the end of each slice.
Statuses: `NOT_STARTED`, `AUDITED`, `IN_PROGRESS`, `IMPLEMENTED`,
`INTEGRATED`, `CUTOVER_READY`, `CUTOVER_COMPLETE`, `DEFERRED`, `BLOCKED`.
"Cutover complete" is never claimed while a legacy FastAPI writer remains
live on the same data unless explicitly noted as an intentional
coexistence design (not this repository's current state for any domain).

| Domain | Current owner | Target owner | Status | Legacy writer | Node API | DB state | Tests | Known gaps |
|---|---|---|---|---|---|---|---|---|
| Identity / OTP | Node (S4) | Node | INTEGRATED | None (Node sole writer of `otp_codes`; `users` still also written by inbound webhooks — see below) | `/api/v1/auth/otp/*`, `/api/v1/auth/register` | `users`, `otp_codes` (existing tables, Node-owned writes) | Unit + integration | FastAPI's `ivr_webhook.py`/`sms_webhook.py` still insert `users` rows directly for inbound calls/SMS — a live, pre-existing dual-writer not created by this migration (S8 audit §E) |
| Registration / case creation / assignment | Node (S5) | Node | INTEGRATED | FastAPI still writes `cases.cnr`/`ecourts_data` (eCourts) and `cases.case_stage` (unvalidated) | Registration flow creates `cases` rows | `cases`, `counsellors` (existing tables) | Unit + integration + concurrency | Live dual-writer on `cases` (S8 audit §E, §P) — Node owns creation/assignment fields, FastAPI owns `cnr`/`ecourts_data`/`case_stage` |
| Consent | Node (S6) | Node | INTEGRATED | Legacy `users.consent_given` boolean (FastAPI, captured once at registration) — not migrated/reconciled in this slice | `/v1/consent/*` | `consents` (new, append-only) | Unit + integration | Two competing consent "authorities" (`users.consent_given` vs. `consents` table) not yet reconciled |
| Profile / preferences | Node (S6) | Node | INTEGRATED | None | `/v1/profile/*` | `victim_profiles` (new) | Unit + integration | — |
| Safety (duress PIN, disguise, safe word, trusted contact) | Node (S6) | Node | INTEGRATED | None | `/v1/safety/*` | `safety_settings` (new) | Unit + integration | Trusted contact not KMS-encrypted (documented gap, no KMS integration exists) |
| Staff identity / console authorization | Node (S7) | Node | INTEGRATED | None | `/v1/console/queue`, `/v1/console/victims/:id` | `staff`, `staff_audit_log` (new) | Unit + integration + security | Minimal audit only — no hash-chain/WORM; no break-glass |
| Case/victim lifecycle | Node (S8) | Node | INTEGRATED (new write path only) | FastAPI's `lifecycle_routes.py` still writes unvalidated `cases.case_stage` | `PATCH /v1/console/cases/:caseId/lifecycle` | `cases.lifecycle_state`/`lifecycle_updated_at`, `victim_profiles.opted_out_at` (additive) | Unit + integration + concurrency + security | Two lifecycle-adjacent columns (`case_stage` legacy/unvalidated vs. `lifecycle_state` new/validated) not reconciled; opt-out is state-only, nothing reacts to it yet |
| Referral | Node (S9, extended S10) | Node | INTEGRATED | None (net-new capability, no FastAPI equivalent) | `POST /v1/console/cases/:caseId/referrals`, `GET`/`PATCH /v1/console/referrals/:id` | `referrals` (S9) + `referrals.in_service_at` (S10 follow-up, additive) | Unit + integration + concurrency + security | No PDF rendering, no delivery adapter, no automated SLA-breach detection; `legal_aid`/`welfare` packets cannot auto-populate CNR/FIR (not modeled in Node yet) |
| Audit (hash-chain; WORM/break-glass/non-staff actors deferred) | Node (S7 minimal, hash-chained S11) | Node | INTEGRATED (hash chain only) | n/a | n/a (`verifyChainIntegrity()` is a service method, not exposed over HTTP) | `staff_audit_log.prev_hash`/`.hash` (additive) + `staff_audit_chain_head` (new singleton) | Unit + integration + concurrency (20-way real concurrent HTTP + tamper detection) | WORM export BLOCKED on an external object-storage decision (genuine credential/infra blocker, not deferred by choice); no non-staff actors; no break-glass — see `docs/S11_AUDIT_HASH_CHAIN_MIGRATION.md` §A |
| Oversight (aggregate, small-count-suppressed) | Node (S10) for the new endpoint; FastAPI (`national_routes.py`/`district_routes.py`/`state_routes.py`) still live, unmodified | Node | INTEGRATED (new endpoint only, no client cutover) | FastAPI (as described) — not touched, not replaced for any real caller yet | `GET /v1/oversight/districts/:code/metrics` | `referrals` (read-only aggregation; no new table) | Unit + integration + security | No nightly job/caching (computed live, in-memory); no cross-district rollup; `state_routes.py`'s fabricated-data problem is NOT fixed by this slice (no client migrated to the new endpoint) — see `docs/S10_OVERSIGHT_MIGRATION.md` §G |
| Triage-router | None real (a Python threshold function stands in) | Node | BLOCKED | FastAPI `rules_engine.py` (not versioned, not `json-rules-engine`, not admin-approval-gated) | None | n/a | None | Hard-blocked on real assessment output (`analysis-svc`/Python work, not a Node migration slice) — see S8 audit §G |
| Scheduling / check-in / silence ladder / workers | FastAPI (`escalation.py`, in-process 10s poll, SOS-only) | Node `workers` | BLOCKED | FastAPI (as described) | None | No `checkins` table | None | Hard-blocked on a job-queue infrastructure decision (Redis/BullMQ) not yet made — S8 audit §F/I |
| Court-sync | FastAPI (`ecourts_scraper.py`/`ecourts_parser.py`, real, request-triggered) | Node `workers` (orchestration) + Python (compute) | NOT_STARTED | FastAPI (as described) | None | Writes `cases.cnr`/`ecourts_data` (unmodeled in Node's Prisma schema) | None (Node side) | Live dual-writer on `cases` (S8 audit §D/E); needs a `milestones` table; needs the poll/diff/event model, none of which exist |
| Channel-gateway / conversation agent / memory / assessment / legal detection | FastAPI (`chatbot_routes.py`, inline, direct LLM call, no crisis guard) | Node gateway + Python `agent-svc`/`memory-svc`/`analysis-svc` | NOT_STARTED | FastAPI (as described) | None | No `sessions`/`memory_chunks`/`assessments` tables | None | Largest remaining rebuild; explicitly out of scope for every S4-S9 slice; blocked on a session model + the crisis-guard design + the job-queue decision |
| Tasks / SLA engine | Node (S12) | Node | INTEGRATED (partial trigger coverage) | None (net-new capability, no FastAPI equivalent) | `GET /v1/console/tasks`, `POST /v1/console/referrals/:referralId/tasks`, `PATCH /v1/console/tasks/:taskId` | `tasks` (new) | Unit + integration + concurrency + security | Real automatic trigger for `referral_stalled` only; `unassigned_case`/`court_sync_stale`/`silence` are evidenced but not wired (the first needs an S5 `RegistrationService` change deliberately deferred, the other two need infrastructure this repo lacks); no SLA-breach automation — see `docs/S12_TASK_MIGRATION.md` §A/G |

## Cross-cutting known gaps (not owned by any single domain row above)

- **No job-queue infrastructure** (Redis/BullMQ) exists anywhere in this
  repository — the single largest fork in the dependency graph (S8 audit
  §F/M). Blocks: automated scheduling, automated court-sync, automated
  referral-SLA escalation, post-session pipeline automation.
- **No RLS enforcement** — every table has `ENABLE ROW LEVEL SECURITY`
  with no permissive policy; the service-role connection bypasses RLS
  entirely. All authorization is application-layer (S4-S12's consistent
  pattern). Never claimed otherwise anywhere in this repository's docs.
- **`fusion.py`'s distress scoring is a keyword-match simulation**,
  presented identically to real model output in every API response and
  stored field. S9's referral packets explicitly exclude this value from
  any external-facing packet for exactly this reason (see
  `docs/S9_REFERRAL_MIGRATION.md` §C).
- **`state_routes.py` (FastAPI oversight) returns 100% hardcoded mock
  data** with no indication to a caller that it is not live.
