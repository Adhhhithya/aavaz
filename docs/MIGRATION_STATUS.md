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
| Registration / case creation / assignment | Node (S5, extended S14) | Node | INTEGRATED | FastAPI still writes `cases.cnr`/`ecourts_data` (eCourts) and `cases.case_stage` (unvalidated) | Registration flow creates `cases` rows | `cases`, `counsellors` (existing tables) | Unit + integration + concurrency | Live dual-writer on `cases` (S8 audit §E, §P) — Node owns creation/assignment fields, FastAPI owns `cnr`/`ecourts_data`/`case_stage`. S14 added a real `unassigned_case` task trigger on the no-eligible-counsellor path — see `docs/S14_TASK_TRIGGER_EXTENSION.md` |
| Consent | Node (S6) | Node | INTEGRATED | Legacy `users.consent_given` boolean (FastAPI, captured once at registration) — not migrated/reconciled in this slice | `/v1/consent/*` | `consents` (new, append-only) | Unit + integration | Two competing consent "authorities" (`users.consent_given` vs. `consents` table) not yet reconciled |
| Profile / preferences | Node (S6) | Node | INTEGRATED | None | `/v1/profile/*` | `victim_profiles` (new) | Unit + integration | — |
| Safety (duress PIN, disguise, safe word, trusted contact) | Node (S6) | Node | INTEGRATED | None | `/v1/safety/*` | `safety_settings` (new) | Unit + integration | Trusted contact not KMS-encrypted (documented gap, no KMS integration exists) |
| Staff identity / console authorization | Node (S7) | Node | INTEGRATED | None | `/v1/console/queue`, `/v1/console/victims/:id` | `staff`, `staff_audit_log` (new) | Unit + integration + security | Minimal audit only at the time of S7 — see the Audit and Break-glass rows below for what S11/S15 since added |
| Case/victim lifecycle | Node (S8) | Node | INTEGRATED (new write path only) | FastAPI's `lifecycle_routes.py` still writes unvalidated `cases.case_stage` | `PATCH /v1/console/cases/:caseId/lifecycle` | `cases.lifecycle_state`/`lifecycle_updated_at`, `victim_profiles.opted_out_at` (additive) | Unit + integration + concurrency + security | Two lifecycle-adjacent columns (`case_stage` legacy/unvalidated vs. `lifecycle_state` new/validated) not reconciled; opt-out is state-only, nothing reacts to it yet |
| Referral | Node (S9, extended S10) | Node | INTEGRATED | None (net-new capability, no FastAPI equivalent) | `POST /v1/console/cases/:caseId/referrals`, `GET`/`PATCH /v1/console/referrals/:id` | `referrals` (S9) + `referrals.in_service_at` (S10 follow-up, additive) | Unit + integration + concurrency + security | No PDF rendering, no delivery adapter, no automated SLA-breach detection; `legal_aid`/`welfare` packets cannot auto-populate CNR/FIR (not modeled in Node yet) |
| Audit (hash-chain; WORM/non-staff actors deferred) | Node (S7 minimal, hash-chained S11) | Node | INTEGRATED (hash chain only) | n/a | n/a (`verifyChainIntegrity()` is a service method, not exposed over HTTP) | `staff_audit_log.prev_hash`/`.hash` (additive) + `staff_audit_chain_head` (new singleton) | Unit + integration + concurrency (20-way real concurrent HTTP + tamper detection) | WORM export BLOCKED on an external object-storage decision (genuine credential/infra blocker, not deferred by choice); no non-staff actors — see `docs/S11_AUDIT_HASH_CHAIN_MIGRATION.md` §A |
| Break-glass access | Node (S15) | Node | INTEGRATED (request/notify foundation only) | None (net-new capability, no FastAPI equivalent) | `POST /v1/console/cases/:caseId/break-glass` | `break_glass_grants` (new) | Unit + integration + security | No existing domain's authorization check (console/lifecycle/referral/task/milestone) actually HONORS a grant yet — `BreakGlassService.isActive()` is a real, tested, unconsumed building block; no revocation path — see `docs/S15_BREAK_GLASS_MIGRATION.md` §A |
| Oversight (aggregate, small-count-suppressed) | Node (S10) for the new endpoint; FastAPI (`national_routes.py`/`district_routes.py`/`state_routes.py`) still live, unmodified | Node | INTEGRATED (new endpoint only, no client cutover) | FastAPI (as described) — not touched, not replaced for any real caller yet | `GET /v1/oversight/districts/:code/metrics` | `referrals` (read-only aggregation; no new table) | Unit + integration + security | No nightly job/caching (computed live, in-memory); no cross-district rollup; `state_routes.py`'s fabricated-data problem is NOT fixed by this slice (no client migrated to the new endpoint) — see `docs/S10_OVERSIGHT_MIGRATION.md` §G |
| Triage-router | None real (a Python threshold function stands in) | Node | BLOCKED | FastAPI `rules_engine.py` (not versioned, not `json-rules-engine`, not admin-approval-gated) | None | n/a | None | Hard-blocked on real assessment output (`analysis-svc`/Python work, not a Node migration slice) — see S8 audit §G |
| Scheduling / check-in / silence ladder / workers | FastAPI (`escalation.py`, in-process 10s poll, SOS-only) | Node `workers` | BLOCKED | FastAPI (as described) | None | No `checkins` table | None | Hard-blocked on a job-queue infrastructure decision (Redis/BullMQ) not yet made — S8 audit §F/I |
| Court-sync (automated poll/diff) | FastAPI (`ecourts_scraper.py`/`ecourts_parser.py`, real, request-triggered) | Node `workers` (orchestration) + Python (compute) | NOT_STARTED | FastAPI (as described) | None | Writes `cases.cnr`/`ecourts_data` (unmodeled in Node's Prisma schema) | None (Node side) | Live dual-writer on `cases` (S8 audit §D/E); needs the poll/diff/event model; the `milestones` table itself now exists (S13) for the manual half of Workflow B, but the automated-poll half remains blocked on a job-queue decision |
| Milestones (case-manager data entry) | Node (S13) | Node | INTEGRATED | None (net-new capability, no FastAPI equivalent) | `POST`/`GET /v1/console/cases/:caseId/milestones`, `PATCH /v1/console/milestones/:milestoneId/met` | `milestones` (new) | Unit + integration + concurrency + security | No automated timer computation (needs a legal-reviewed template this repo has no sign-off for) or expiry handling (needs the job queue); no correction/deletion path — see `docs/S13_MILESTONE_MIGRATION.md` §A |
| Channel-gateway / conversation agent / memory / assessment / legal detection | FastAPI (`chatbot_routes.py`, inline, direct LLM call, no crisis guard) | Node gateway + Python `agent-svc`/`memory-svc`/`analysis-svc` | NOT_STARTED | FastAPI (as described) | None | No `sessions`/`memory_chunks`/`assessments` tables | None | Largest remaining rebuild; explicitly out of scope for every S4-S9 slice; blocked on a session model + the crisis-guard design + the job-queue decision |
| Tasks / SLA engine | Node (S12, extended S14) | Node | INTEGRATED (partial trigger coverage) | None (net-new capability, no FastAPI equivalent) | `GET /v1/console/tasks`, `POST /v1/console/referrals/:referralId/tasks`, `PATCH /v1/console/tasks/:taskId` | `tasks` (new) | Unit + integration + concurrency + security | Real automatic triggers for `referral_stalled` (S12) and `unassigned_case` (S14, wired into S5's `RegistrationService`); `court_sync_stale`/`silence` remain unwired — both need infrastructure this repo lacks; no SLA-breach automation — see `docs/S12_TASK_MIGRATION.md` §A/G and `docs/S14_TASK_TRIGGER_EXTENSION.md` |

## Cross-cutting known gaps (not owned by any single domain row above)

- **No job-queue infrastructure** (Redis/BullMQ) exists anywhere in this
  repository — the single largest fork in the dependency graph (S8 audit
  §F/M). Blocks: automated scheduling, automated court-sync, automated
  referral-SLA escalation, post-session pipeline automation.
- **No RLS enforcement** — every table has `ENABLE ROW LEVEL SECURITY`
  with no permissive policy; the service-role connection bypasses RLS
  entirely. All authorization is application-layer (S4-S15's consistent
  pattern). Never claimed otherwise anywhere in this repository's docs.
- **`fusion.py`'s distress scoring is a keyword-match simulation**,
  presented identically to real model output in every API response and
  stored field. S9's referral packets explicitly exclude this value from
  any external-facing packet for exactly this reason (see
  `docs/S9_REFERRAL_MIGRATION.md` §C).
- **`state_routes.py` (FastAPI oversight) returns 100% hardcoded mock
  data** with no indication to a caller that it is not live.
- **`AAVAZ_MIGRATION_PLAN.md`'s Decision 5 (removing the fabricated CNR
  `DLCT110011162019` and its downstream fabricated legal facts from the
  FastAPI eCourts parser) is CONFIRMED DONE**, verified during S14's own
  re-audit by running `backend/tests/test_ecourts_fabrication_removed.py`
  directly (6/6 passing) — this was completed in an earlier session, not
  this one, and is recorded here so it stops appearing as open work in
  future audits of this document.
