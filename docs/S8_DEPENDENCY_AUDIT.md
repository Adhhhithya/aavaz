# S8_DEPENDENCY_AUDIT.md

**READ-ONLY architecture/dependency audit.** No application code, schema,
migration, or client file was modified to produce this document. This
document itself is the only file change. Produced at
`HEAD 85b920c4c1cb5c5a4e247ea9d63143642a5beef4` on `feat/aavaz-integration`,
with S1–S7 complete and both remotes matching HEAD.

Every claim below was verified by reading the actual repository or the
actual PDF text — nothing is inferred from a filename alone, and nothing
is assumed to exist because v0.2 describes it.

---

## A. Executive summary

The repository after S7 has a real, tested, additive Node identity/
registration/case/counsellor-assignment/consent/profile/safety/staff/
console foundation (S4–S7). It has **no** job-queue infrastructure
(Redis/BullMQ — grepped across the whole application code, zero matches
outside third-party vendor code), **no** `apps/workers`, **no** `ai/`
service split (all Python remains one FastAPI monolith in `backend/`), and
**no** event bus of any kind. The FastAPI side has one real, working,
non-trivial capability worth noting (the eCourts scraper/parser — a genuine
external integration) and several capabilities that are direct
keyword-matching or `setTimeout`-style simulations presented as if they
were model output (the "distress scoring" pipeline, the mobile-app
chatbot's risk categorization, the translation service). A concrete,
currently-exploitable-by-any-staff-role gap was found in lifecycle handling
(Section K/P): the existing case-stage-update endpoint accepts an
unvalidated arbitrary string. No `sessions`, `checkins`, `tasks`,
`referrals`, `milestones`, or `assessments` table exists anywhere in the
real, repeatedly-introspected schema (12 real tables total — enumerated in
Section E). Given this, the domains most commonly assumed to be "next"
(triage, scheduling, channel-gateway) are each blocked on either missing
input data (triage needs real assessment output, which doesn't exist),
missing infrastructure (scheduling needs a job queue, which doesn't
exist), or a from-scratch architectural rebuild (channel-gateway has no
reusable Node-side code at all). The candidate best supported by actual
evidence — small, additive, no new infrastructure, and sitting on the
critical path of every operational domain that reads or writes lifecycle
state — is a **case/victim lifecycle domain foundation**, detailed in
Section N.

---

## B. Current migration checkpoint

S1–S7 complete, as stated in the task. `HEAD =
85b920c4c1cb5c5a4e247ea9d63143642a5beef4`. `origin/feat/aavaz-integration`
and `targaryens/feat/aavaz-integration` both match HEAD.
`targaryens/main` unchanged. Verified via `git status --short` (empty) and
`git log` before writing anything.

---

## C. v0.2 responsibilities (read from the spec, not summarized from memory)

Extracted directly from `docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf`:

- **Node core-api**: "Modular monolith with modules `identity-consent`,
  `profile-case`, `triage-router`, `referral`, `console`, `oversight`,
  `audit`. Sole writer of domain tables." (§1)
- **Node workers**: "Court sync, check-in scheduling, silence ladder,
  post-session orchestration, SLA timers, notifier, purge job. BullMQ
  (MVP), Temporal... (production), ioredis." (§1) — a **separate app**
  (`apps/workers/`) in v0.2's repository layout (§16), distinct from
  `core-api`.
- **triage-router**: Node module; routes `assessment.completed` or a
  safety event to a final level, automatic actions, human SLA, and a
  lifecycle transition (Workflow F, §7 in-document numbering, table on
  page 16). Rules stored as versioned JSON, evaluated with
  `json-rules-engine`; changing a rule needs a second admin's approval.
  Duress PIN and live crisis events **skip the engine** and go straight to
  Critical.
- **referral**: Node module; a 9-state lifecycle
  (`DRAFTED → AWAITING_CONSENT/APPROVED → SENT → BOUNCED/DELIVERED →
  ACKNOWLEDGED → IN_SERVICE → VERIFIED/STALLED → CLOSED_UNRESOLVED`,
  Workflow G); consent-gated before `SENT`; per-destination "minimum
  necessary data" packets (Puppeteer PDF in `core-api`); idempotency key
  `referral_id:attempt`; default SLA 3 working days to acknowledge, 10 to
  start service.
- **console**: React app (`apps/console/`); case manager and supervisor
  web app; backed by `GET /v1/console/queue`, `GET
  /v1/console/victims/{id}`, `POST /v1/console/assessments/{id}/review`,
  `POST /v1/console/referrals/{id}/approve` (§14).
- **oversight**: `GET /v1/oversight/districts/{code}/metrics` — "Aggregates
  with small-count suppression"; role table (§15) explicitly says this
  tier "cannot see any individual record."
- **audit**: `audit_log(id, actor_id, action, resource_type, resource_id,
  reason, at, prev_hash, hash)` — hash-chained, "every read of victim
  content is logged," "daily export to write-once storage" (§15).
- **check-in scheduling** (Workflow C): 8 trigger types (`periodic`,
  `pre_hearing`, `post_hearing`, `milestone_due`, `post_referral`,
  `silence_followup`, `manual`, `victim_initiated`); 48-hour trigger
  merging; safe-window enforcement; 24-hour cooldown; neutral outbound
  wording; a BullMQ-delayed-job MVP pattern shown in JavaScript, with a
  Temporal-workflow production target; a silence ladder (preferred
  channel → 24h wait → alternate channel → 72h wait → task).
- **court-sync** (Workflow B): nightly poll per active CNR + morning-after
  poll for hearings; normalizes into a snapshot (`stage`,
  `next_hearing_at`, `court_code`, `disposal`); diffs against the last
  stored snapshot; emits `hearing.scheduled`/`.completed`,
  `case.transferred`, `case.disposed`; exponential backoff, 72h staleness
  flag; manual milestone entry for chargesheet/relief events, which starts
  configurable milestone timers.
- **channel-gateway**: holds every victim connection (Socket.IO for
  text/web, a reduced-menu flow for SMS, streaming ASR/TTS for voice via
  `speech-svc`); validates every turn into a Zod-typed envelope; relays to
  `agent-svc` over HTTP+SSE, never calls an LLM itself.
- **conversation-agent** (`agent-svc`, Python/FastAPI/LangGraph): the live
  turn loop (Workflow D) — a fast crisis-rules check runs **before** the
  agent sees the turn; on Critical, jumps straight to a crisis node and
  emits `safety.crisis_detected`; an output guard checks every reply
  before it's sent.
- **memory** (`memory-svc`, Python): context assembly (policy prompt, case
  state card, rolling summary, session agenda, retrieved memories via
  pgvector top-8/cosine/MMR-rerank-to-4, recent turns); retrieval is
  "victim-scoped in the SQL itself and enforced again by row-level
  security... takes no free-form filter parameter."
- **assessment** (`analysis-svc`, Python, Workflow E steps E4/E6): three
  independent signals (screener PHQ-4 band, LLM classifier with a
  structured JSON output including `confidence`/`dimensions`/
  `risk_flags`/`review_required`, safety rules) fused by a documented
  `fuse()` function; **explicit safety rule: "if `llm.confidence < 0.6`:
  `review = True`" — "uncertain model: never downgrade"** — plus a
  previous-level-jump rule and an open-threat floor. Node (a worker)
  writes the result via Prisma and emits `assessment.completed`; Python
  only computes.
- **legal detection** (`analysis-svc`, Workflow E step E5): multi-label
  classification over an 8-code issue taxonomy (`INTIMIDATION`,
  `COMPROMISE_PRESSURE`, `POLICE_INACTION`, `INVESTIGATION_DELAY`,
  `RELIEF_NOT_PAID`, `HEARING_NOT_INFORMED`, `IDENTITY_DISCLOSURE`,
  `SOCIAL_BOYCOTT`), each with a real statute reference; a citation is
  kept "only if its chunk ID appears in the retrieval results... otherwise
  dropped and the issue is shown as 'reference needed'"; flags are always
  labeled "possible issue for legal review," never shown to the victim as
  conclusions.
- **Event catalog** (§13): the 13 events named in the task, each with a
  named producer/consumer/payload-keys triple — payloads are explicitly
  "IDs and codes, never free-text victim content."
- **Lifecycle** (§3): `PENDING_CONSENT → REGISTERED → VERIFIED →
  MONITORING → ESCALATED/REFERRED/PAUSED/CLOSING → CLOSED/OPTED_OUT →
  PURGED`, one state per victim record, on the `victims` table.
- **Security controls** (§15): access-by-role table (Victim / Case manager
  / Supervisor / Referral receiver / District oversight / Engineer-admin),
  envelope encryption per victim, break-glass (typed reason, 2h expiry,
  notifies supervisor), hash-chained audit, LLM no-training/minimal-
  retention terms, prompt-injection containment ("no tools that write
  outside its session or query other victims"), default pseudonymisation
  for sexual-offence survivors, signed+replay-windowed webhooks.
- **Data ownership** (§2/§12): Node owns 12 named tables via Prisma;
  Python owns `memory_chunks`/`case_summaries`/`statute_chunks` via
  Alembic; "Python gets only what a request carries; no direct DB role on
  [Node's] tables."
- **API boundaries** (§14): a public API table (all served by Node) and a
  separate **internal-only** AI API table (Python, unreachable from
  outside the cluster) — a hard boundary this repository does not
  currently have at all (see Section D/J).

---

## D. Current implementation matrix

| Domain | v0.2 owner | Current owner | Implementation state | Node-ready? | Dependencies | Risks |
|---|---|---|---|---|---|---|
| triage-router | Node (`core-api`) | None as a module; a single Python threshold function (`backend/api/interventions/rules_engine.py::get_intervention_recommendation`) stands in for it, called nowhere in the request path that actually feeds it real assessment data | **PARTIAL/LEGACY** — a trivial if/elif ladder, not `json-rules-engine`, not versioned, not admin-approval-gated | No | Real `assessment.completed`-shaped input | Its input doesn't exist yet (see G) |
| referral | Node (`core-api`) | None | **MISSING** — no `referrals` table anywhere in the 12-table real schema (Section E) | No | consent (exists), a packet-building pattern (exists, see below) | n/a — nothing built yet |
| audit | Node (`core-api`) | Node, partially — S7's `staff_audit_log` | **PARTIAL** — append-only, actor/action/resource/timestamp exist; no `reason`-in-use, no `prev_hash`/`hash`, no WORM export, staff-console-reads only | Yes, as a foundation to extend | none | S7's own doc already states this is not the full subsystem |
| oversight | Node (`core-api`) | FastAPI (`national_routes.py` real+redacted, `district_routes.py` real+district-unscoped, `state_routes.py` **100% hardcoded mock**) | **LEGACY/PARTIAL** on FastAPI side; **MISSING** on Node side | No | S7's staff/console pattern (exists) | `state_routes.py` returning fabricated numbers as if real is a concrete, verified fact |
| scheduling | Node `workers` | FastAPI, one in-process poll loop (`backend/api/assignment/escalation.py::check_and_escalate_sos`, started via `@app.on_event("startup")`) | **LEGACY** — polls every 10s inside the FastAPI process itself; only covers SOS 30-min escalation; not BullMQ/Temporal, not the 8-trigger model, no persistence beyond the DB row | No | A job queue (does not exist), a `checkins` table (does not exist), victim lifecycle state (does not exist) | See Section I |
| silence ladder | Node `workers` | None | **MISSING** | No | Scheduling infra | n/a |
| post-session orchestration | Node `workers` | None (chat scoring happens synchronously inline in the same FastAPI request, not as a post-session async pipeline) | **MISSING** as a separate pipeline; the *effect* (writing a score) happens synchronously today | No | A `sessions` table (does not exist) | n/a |
| SLA timers | Node `workers` | None | **MISSING** | No | Job queue | n/a |
| notifier | Node `workers` | None real; comments only ("In a full production system, trigger SMS/Push... here" — `ivr_webhook.py`) | **MISSING** | No | Job queue, a real SMS/push provider integration (Pushbullet path exists for *inbound* SMS only, per S1/S6 findings) | n/a |
| purge | Node `workers` | None | **MISSING** — no opt-out flow, no lifecycle state to trigger it, no KMS/object-storage integration anywhere in this repo | No | Lifecycle state, KMS (does not exist), object storage (does not exist) | n/a |
| court-sync | Node `workers` (polling orchestration) + Python (compute) | FastAPI, `backend/services/ecourts_scraper.py` + `ecourts_parser.py`, exposed via `backend/api/cases/ecourts_routes.py` | **LEGACY, but genuinely real** — a real, working scrape+LLM-cleanup pipeline (already flagged in S1/S3 audits as "further along than v0.2 assumed"), **triggered synchronously by a client request, not a nightly poll**, and **writes `cases.cnr`/`ecourts_data` directly from Python** | Partially — the compute step is real and reusable; the poll/diff/event/ownership model is not | A `milestones` table (does not exist); resolving the existing Python-writes-`cases` pattern (see Section E) | **Confirmed, currently-live dual-writer on `cases`**: Python (`ecourts_routes.py`) writes `cnr`/`ecourts_data`; Node (S5) writes `case_type`/`assignedCounsellorId`/etc. on the same rows via Prisma — no coordination exists between the two today |
| channel-gateway | Node | None | **MISSING** — no WebSocket/Socket.IO found anywhere in `backend/` (grepped); the mobile chatbot is a single synchronous FastAPI POST endpoint | No | A session model, an envelope contract, a place to route to | See Section J |
| conversation agent | Python (`agent-svc`, separate service) | FastAPI, inline in `backend/api/intake/chatbot_routes.py`, calling `backend/services/llm_parser.py` (a **real** Groq call) | **LEGACY** — the chat *reply* is a real LLM call; there is no crisis-guard-before-agent step, no output guard, no session/turn envelope, no SSE, no separate service boundary | No | Session model | The "crisis" signal that exists is baked into the same keyword-matching function used for scoring (see next row), not a fast pre-turn safety check |
| memory | Python (`memory-svc`) | None | **MISSING** — no `memory_chunks` table, no pgvector usage, no embeddings anywhere in this repository | No | pgvector extension (unverified whether enabled on the live DB), a real embedding model/API | n/a |
| assessment | Python (`analysis-svc`) | FastAPI, `backend/api/scoring/fusion.py::calculate_dynamic_score` | **INCOMPATIBLE with v0.2** — this is a keyword-substring match (`"kill"`/`"murder"`/`"rape"`/`"caste"` etc.) against the raw message, hardcoded to one of four canned score/reason bundles, explicitly commented as a simulation ("STEP 3: Execute LLM (Simulated for this prototype...)"). No screener signal, no LLM confidence value, no `dimensions`, no `review_required`, no fusion of multiple signals, no previous-level-jump rule, no open-threat floor | No | A real classifier/screener, none of which exist | The `confidence < 0.6` safety rule cannot exist because no confidence value is ever produced |
| legal detection | Python (`analysis-svc`) | None | **MISSING** — no issue taxonomy, no statute-citation-verification code anywhere (confirmed by search) | No | Real classification + a statute-chunk retrieval corpus, neither of which exist | n/a |

---

## E. Data ownership audit

**Every real table in the actual database**, confirmed by direct
inspection of `backend/schema.sql` and every migration file (also
cross-checked against four separate real-Postgres-introspection passes
already performed and documented across S4–S7): `users`, `counsellors`,
`cases`, `interactions`, `case_updates`, `sos_events`, `otp_codes`,
`consents`, `victim_profiles`, `safety_settings`, `staff`,
`staff_audit_log`. **Twelve tables total.** None of `milestones`,
`checkins`, `sessions`, `assessments`, `extracted_facts`, `tasks`,
`referrals`, `memory_chunks`, `case_summaries`, or a hash-chained
`audit_log` exist.

| v0.2 table | Exists? | Who writes | Who reads | Dual-writer? | Migration required? | Provenance |
|---|---|---|---|---|---|---|
| `victims` | No (closest: `users`) | Node (S4/S5 `IdentityService`/`RegistrationService`) | Node + FastAPI (both query `users` directly) | **FastAPI still writes `users` too** (e.g. `ivr_webhook.py`/`sms_webhook.py` insert rows directly for inbound calls/SMS) — a live, pre-existing dual-writer, not introduced by S8 | Yes, if the full `victims` shape (district_code, relation_type, etc. as first-class columns rather than split across `users`+`victim_profiles`) is ever wanted | Known — every S4–S7 doc traces this table's real shape |
| `cases` | Yes | Node (S5, creation) **and** FastAPI (`ecourts_routes.py`, `cnr`/`ecourts_data`; `lifecycle_routes.py`, `case_stage`) | Both | **Yes — confirmed, live** (see Section D's court-sync row) | No new migration required to *observe* this; fixing it is a design decision | Known |
| `milestones` | No | — | — | n/a | Yes, additive | n/a |
| `consents` | Yes | Node only (S6) | Node only | No | No | Known |
| `safety_settings` | Yes | Node only (S6) | Node only | No | No | Known |
| `checkins` | No | — | — | n/a | Yes, additive | n/a |
| `sessions` | No (closest: `interactions`, Python-owned, message-level not session-level) | — | — | n/a | Yes, additive | n/a |
| `assessments` | No (closest: fields bolted onto `cases`/`interactions` — `current_distress_score`, `predicted_escalation_risk`, `score_breakdown`) | FastAPI writes these fields today | FastAPI + Node (Node reads `currentDistressScore` for queue sorting, S7) | FastAPI writes, Node reads-only today for this specific data | Yes, if a real `assessments` table is wanted | Known |
| `extracted_facts` | No | — | — | n/a | Yes, additive | n/a |
| `tasks` | No | — | — | n/a | Yes, additive | n/a |
| `referrals` | No | — | — | n/a | Yes, additive | n/a |
| `staff` | Yes | Node only (S7) | Node only | No | No | Known, S7's own bridge design |
| `audit_log` | No (closest: `staff_audit_log`, narrower) | Node only (S7) | Node only | No | Yes, if the full hash-chained shape is wanted | Known |
| `memory_chunks` | No | — | — | n/a | Yes (Alembic, Python-owned per v0.2) | n/a |
| `case_summaries` | No | — | — | n/a | Yes (Alembic, Python-owned per v0.2) | n/a |

**The one confirmed, currently-live dual-writer hazard**: `cases`. This
predates S8 and is not created by anything proposed in this document —
flagged here because any S8 candidate touching `cases` (lifecycle
hardening, referral, court-sync) must account for it explicitly rather
than silently assuming Node is already the sole writer, which v0.2 §2
claims but this repository does not yet achieve.

---

## F. Event architecture audit

**Zero event infrastructure exists.** Grepped `apps/core-api/package.json`
and every `.ts`/`.py` file under `apps/core-api/src` and `backend/` (the
FastAPI monolith) for Redis, ioredis, and BullMQ — the only matches are
false positives inside third-party vendor packages
(`backend/.venv/Lib/site-packages/...`), not application code. No event
publisher, no event consumer, no event contract/schema, no idempotency
mechanism beyond ordinary database unique constraints (e.g. `users.
phone_number UNIQUE`, `staff.user_id UNIQUE`), no retry policy, no
dead-letter handling, and no event-level auditability exist anywhere.

Compared against the v0.2 event catalog's 13 named events: **none are
emitted anywhere in this codebase.** The closest analogues are ordinary,
synchronous function returns and direct database writes within a single
FastAPI request (e.g. `chatbot_routes.py` computing a score and writing it
to `cases` in the same request that generated the chat reply — there is no
`assessment.completed`-shaped emission separating "compute" from
"someone else reacts to it").

**What this blocks**: any slice whose design assumes pub/sub semantics
(triage reacting to `assessment.completed`, a notifier reacting to
`task.created`, oversight reacting to `referral.state_changed`,
`workers` reacting to `checkin.due`) cannot be built as v0.2 describes it
without first deciding whether to introduce Redis/BullMQ as new
infrastructure — a categorically different kind of change from every
additive-Prisma-migration slice S4–S7 performed. This document does not
recommend making that decision as part of S8 (see Section N).

---

## G. Triage dependency audit

Traced the chain `assessment.completed → triage-router → task.created/
.breached → console/notifier` against the actual repository:

- **Assessment output**: does not exist in v0.2's shape. `fusion.py`
  produces `{final_score, escalation_risk, case_type,
  recommended_intervention, reasoning}` — no `confidence`, no
  `dimensions`, no `risk_flags`, no `review_required`, no `final_level`
  as one of the five named bands (Good/Okay/Bad/Serious/Critical) — it's
  a raw 0–100 integer instead.
- **`review_required` / the confidence<0.6 rule**: cannot exist, because
  no confidence value is ever produced. This is not "implemented
  incorrectly" — the input the rule depends on is structurally absent.
- **Crisis/duress bypass**: v0.2 requires the duress PIN and live crisis
  events to skip the routing engine entirely and go straight to Critical.
  Today, the closest thing to a "crisis" signal is the same keyword match
  used for ordinary scoring (`"kill"`/`"murder"`/`"weapon"` inside
  `fusion.py`) — there is no separate, faster pre-check that runs before
  anything else, and the duress PIN (real, Argon2id-hashed, S6/S7) has no
  code path anywhere that emits a `safety.duress`-shaped event or routes
  to anything. **The bypass property cannot be verified because neither
  side of it (a real crisis path or a real duress-triggered path) exists.**
- **Rule configuration / versioned rules**: `rules_engine.py` is a single
  Python `if/elif` function, not `json-rules-engine`, not versioned, not
  gated by a second admin's approval.
- **Task model / SLA fields / staff assignment / console visibility**: no
  `tasks` table exists. Staff assignment (S7) and console visibility (S7)
  do exist and are real, tested, and reusable — this is the one piece of
  the chain that is genuinely ready.

**Conclusion, evidence-based**: triage cannot be safely migrated now. Its
required input (a real, confidence-bearing assessment) does not exist in
this repository in any form, mocked or real, and building triage against
the current `fusion.py` output would mean building against fabricated
data shaped nothing like what the safety rule set actually needs.

---

## H. Audit dependency audit

S7's `staff_audit_log` (Section D/E) is genuinely append-only, records a
real `actorId`→`staffId`, a closed set of action codes, a resource
type/id, and a timestamp — verified by its own test suite (S7). It does
**not** have `prev_hash`/`hash` (no tamper-evidence), does not export
anywhere (no WORM/write-once storage integration exists in this
repository at all), and only ever records **staff console reads** — no
victim-initiated action, no system/worker action, and no `reason` value
is ever populated (S7's own migration file documents this as reserved for
a future break-glass flow).

**Does the full audit subsystem have to precede the next domain?**
Evidence-based answer: **no, not as an all-or-nothing gate.** S7 already
established a working, tested, extensible pattern (one append-only table,
one narrow writer service, closed action-code sets) that a future domain
can extend with its own action codes the same way S7 extended nothing —
it introduced the pattern fresh. The genuinely missing pieces (hash
chaining, WORM export) are orthogonal capabilities that harden the
*existing* log, not prerequisites for anything else in this repository to
function. Whether hash-chaining is added incrementally alongside a future
domain's own audit needs, or as its own dedicated slice, is a scope
decision — not one this audit resolves, since only decision-relevant
evidence (not a recommendation to implement) is in scope here per this
task's own instruction not to implement audit.

---

## I. Scheduling dependency audit

Checked actual availability of every input the 8 trigger types need:

| Input | Available? | Evidence |
|---|---|---|
| Victim lifecycle | **No** as a first-class field — only `cases.case_stage` (6-value, case-scoped, not victim-scoped) exists | Section K |
| Safe windows | **Yes** | `victim_profiles.safe_windows` (S6, jsonb) |
| Preferred channel | **Yes** | `victim_profiles.preferred_channel` (S6) |
| Hearing date | **Partially** — `cases` has no `next_hearing_at` column in the real schema; eCourts data is stashed in an unmodeled `ecourts_data` jsonb blob (Section D) | `backend/schema.sql`, `ecourts_routes.py` |
| Milestones | **No** | No `milestones` table |
| Referral state | **No** | No `referrals` table |
| Last session | **No** | No `sessions` table; `interactions` exists but is message-level, Python-owned, no session grouping |
| Last assessment | **Partially** — `cases.current_distress_score`/`predicted_escalation_risk` exist but are not a real assessment (Section G) | `fusion.py` |
| Pause/opt-out state | **No** | No field anywhere represents this |
| Cooldown data | **No** | No concept of "last completed session" exists to compute a cooldown from |
| Trigger persistence | **No** | No `checkins` table, no job queue |
| Checkin model | **No** | Confirmed absent (Section E) |
| Job queue | **No** | Confirmed absent (Section F) |

**48-hour trigger merging, safe-window enforcement, 24-hour cooldown,
neutral outbound wording, silence ladder, paused/opted-out handling**: none
of these are implemented anywhere. There is nothing to "merge" or
"enforce" because there is no trigger-emission mechanism at all yet.

**Conclusion, evidence-based**: scheduling is blocked by **all four**
categories the task asks about — missing domain models (`checkins`,
lifecycle, milestones, referral state), missing event infrastructure
(Section F), missing channel-gateway (nothing can actually deliver an
outbound message today — the one real outbound-adjacent code path,
Pushbullet SMS, is documented in S1/S6 as inbound-only with an
unverified/likely-nonfunctional outbound send), and — distinct from the
other three — the job-queue decision itself (Redis/BullMQ) is an
infrastructure-category decision this repository has not made yet at all,
not merely an unimplemented feature.

---

## J. Channel/conversation dependency audit

Searched `backend/` for WebSocket, Socket.IO, and any streaming
infrastructure: **no matches**. The victim-facing "chat" is
`POST /api/v1/intake/chatbot/message` (`chatbot_routes.py`) — a single
synchronous FastAPI request that: reads case/user context, calls a real
Groq LLM for the reply (`llm_parser.py`), separately calls the mocked
scoring function (`fusion.py`), and writes two `interactions` rows (user
message, bot reply) plus updates `cases.current_distress_score` — all in
one request/response cycle, no session object, no turn index concept
beyond message ordering in `interactions`, no SSE, no crisis guard ahead
of the agent, no output guard on the reply before it's returned.

Compared against v0.2's explicit requirement that "channels never call AI
services directly" and traffic goes through the gateway and consent/
safety layer first: **the current implementation is the direct
counter-example** — the "channel" (the mobile app's chat screen, via this
one endpoint) calls the LLM directly, in-process, with no gateway, no
consent check gating the call, and no safety layer ahead of it.

**Minimum Node-side prerequisites for a later channel migration**,
evidence-based: (1) a real `sessions` table (does not exist) so a
"conversation" is a first-class, ownable record rather than an implicit
grouping of `interactions` rows; (2) a decision on where the crisis-guard
fast-path lives, since today's only crisis-adjacent signal is entangled
with the same function used for ordinary scoring; (3) the same
job-queue/event-infrastructure decision from Section F, since v0.2's
gateway relays over SSE and the post-session pipeline is BullMQ-driven.
None of these exist today, and none are proposed to be built in S8 (this
matches the task's own explicit exclusion of channel-gateway from any
near-term slice).

---

## K. Lifecycle audit

**Which states exist in the current DB**: none of v0.2's 11 states exist
anywhere. The real, introspected `case_stage_enum` has 6 different values
(`registered`, `investigation`, `trial`, `compensation`, `rehabilitation`,
`closed`) — already documented as a deliberate, un-migrated divergence in
`docs/S5_REGISTRATION_MIGRATION.md`. This is a **case**-level field, not a
**victim**-level field — v0.2's lifecycle is explicitly per-victim
(`victims.lifecycle_state`).

**Who changes it**: only one code path — FastAPI's
`POST /api/v1/cases/{case_id}/stage` (`backend/api/cases/
lifecycle_routes.py::update_case_stage`), gated by
`require_roles("counsellor", "district_admin", "state_admin",
"national_admin", "super_admin")`, plus (for the `counsellor` role only)
a check that the case is actually assigned to that counsellor.

**Whether transitions are enforced**: **no.** The request body's
`new_stage` field is typed as a bare Pydantic `str`, with no `Literal`/
enum constraint and no state-machine validation of any kind. **Verified by
reading the code, not assumed**: any of the five non-`counsellor` roles —
or a `counsellor` for their own assigned case — can set `case_stage` to
**any string at all**, including a value that doesn't even exist in the
real 6-value enum, subject only to whatever the database itself would
reject (a Postgres enum type would reject an unrecognized value at the
`UPDATE` statement, but a role check has already passed by that point, and
the code has no earlier validation layer of its own).

**Whether any client can directly set lifecycle**: **yes**, effectively —
any authenticated staff account with one of the five roles above can set
any case's stage to any value it wants, with no transition-validity check
(e.g. nothing prevents `closed → registered`).

**Whether FastAPI can mutate lifecycle**: yes — it's the only thing that
does today, per the above. Node has never written `case_stage` after its
one-time `'registered'` default at case-creation time (S5).

**Which future domain depends on lifecycle being authoritative**: every
operational domain examined in this document reads or writes it —
triage's level-to-lifecycle mapping (Good→MONITORING,
Bad/Serious/Critical→ESCALATED), referral approval (implicitly tied to
case progress), scheduling (must not contact a PAUSED/OPTED_OUT victim),
and closure/opt-out (Workflow I moves the state to
CLOSING/CLOSED/OPTED_OUT/PURGED). None of them can be built on a trustworthy
foundation while the only real write path accepts an arbitrary string from
any of five staff roles.

---

## L. Candidate slice analysis (no ranking, no scores)

### A. Full audit subsystem
- **Prerequisites**: none hard.
- **Exists**: S7's `staff_audit_log` (append-only, actor/action/resource/
  timestamp).
- **Missing**: `prev_hash`/`hash` chaining, WORM export target (no object
  storage integration exists anywhere in this repo), non-staff actors.
- **Complexity**: moderate (crypto chaining is straightforward; the export
  job needs an object-storage decision this repo hasn't made).
- **Security implications**: raises tamper-evidence; does not itself close
  any currently-exploitable gap.
- **Data ownership**: pure Node addition, no FastAPI equivalent to
  conflict with.
- **FastAPI coexistence**: trivial — FastAPI never wrote audit data.
- **Event dependencies**: none required (can stay synchronous).
- **Downstream unblocked**: break-glass, compliance reporting.
- **Leaves blocked**: nothing — orthogonal to whether any operational
  domain can proceed.

### B. Task/SLA domain foundation
- **Prerequisites**: staff assignment (exists, S7), console visibility
  (exists, S7).
- **Exists**: the district/assignment-scoped query pattern S7 already
  proved.
- **Missing**: `tasks` table; a real trigger (`assessment.completed`
  doesn't exist, Section G) — tasks would need a manual/console-driven
  creation path as a stopgap, not an automatic one.
- **Complexity**: low for the table + manual creation; SLA-timer
  *enforcement* needs the missing job queue (Section F).
- **Security implications**: must reuse S7's exact district/assignment
  scoping, or it re-opens the same class of gap S7 closed.
- **Data ownership**: net-new, no FastAPI equivalent.
- **FastAPI coexistence**: zero dual-write risk (nothing else writes
  tasks).
- **Event dependencies**: full automation blocked without Section F;
  manual creation is not.
- **Downstream unblocked**: triage's task-creation step, referral review
  tasks.
- **Leaves blocked**: automated SLA breach handling, without Section F.

### C. Triage-router foundation
- **Prerequisites**: real assessment output (Section G) — **missing
  entirely**, lifecycle authoritative state (Section K) — **missing**,
  task model (candidate B) — **missing**.
- **Exists**: a non-reusable Python threshold function as informal prior
  art only.
- **Complexity**: cannot be meaningfully scoped small — its own input
  doesn't exist.
- **Security implications**: the crisis/duress-bypass property (a hard
  v0.2 requirement) cannot be verified without a real crisis signal to
  test against.
- **Data ownership**: would need to define a new `assessments`-adjacent
  contract with no real producer yet.
- **FastAPI coexistence**: n/a — nothing to coexist with yet.
- **Event dependencies**: `assessment.completed` doesn't exist.
- **Downstream unblocked**: nothing, since its own dependencies are
  unmet.
- **Leaves blocked**: everything chained after it (tasks, notifier,
  console review).

### D. Referral domain
- **Prerequisites**: consent (exists, S6), case data (exists, S5).
- **Exists**: a real, reusable PDF-generation pattern
  (`report_routes.py`, `reportlab`) — not a referral packet specifically,
  but the same *kind* of artifact; consent-gate check pattern (S6).
- **Missing**: `referrals` table, the 9-state lifecycle, per-destination
  minimum-necessary-data templates, delivery adapters (email+SMS-password,
  manual-entry — neither exists), idempotency key handling (a DB
  constraint, not infra-dependent).
- **Complexity**: moderate–high — a real state machine with 9 states, but
  no infra category gap (no job queue strictly required for a
  manually-triggered send/ack flow).
- **Security implications**: per-destination data minimization must be
  enforced structurally (e.g. a mental-health destination template must
  be structurally incapable of including FIR/crime fields) — a real,
  named risk, not hypothetical (v0.2 §9 spells out exactly what each
  destination must never receive).
- **Data ownership**: net-new, no FastAPI equivalent — `report_routes.py`
  generates a *different* artifact (a case status report, not a referral
  packet).
- **FastAPI coexistence**: zero dual-write risk.
- **Event dependencies**: `referral.state_changed`'s consumers
  (scheduler, oversight) don't exist yet — a soft, not hard, dependency;
  the state machine itself doesn't need them to function.
- **Downstream unblocked**: closed-loop verification (Workflow H),
  oversight's referral metrics.
- **Leaves blocked**: automated SLA escalation on stalled referrals
  (Section F gap).

### E. Scheduling/workers foundation
- **Prerequisites**: a job queue (Redis+BullMQ) — **does not exist,
  would be new infrastructure**, `checkins` table — missing, victim
  lifecycle — missing (Section K), a delivery mechanism — missing
  (Section J).
- **Exists**: safe windows + preferred channel (S6) — genuinely reusable
  inputs.
- **Complexity**: very high — the first slice in this migration that
  would require introducing a new infrastructure *category*, not just an
  additive Prisma model, breaking the pattern every prior slice (S4–S7)
  followed.
- **Security implications**: no automated outbound contact exists today,
  so there's no regression risk from *not* building it yet; building it
  incorrectly risks inappropriate contact with a survivor, a
  domain-specific safety concern distinct from ordinary data-safety bugs.
- **Data ownership**: net-new.
- **FastAPI coexistence**: n/a.
- **Event dependencies**: hard-blocked without Section F.
- **Downstream unblocked**: check-in delivery, silence ladder,
  post-session orchestration's trigger source.
- **Leaves blocked**: itself, until the infra decision is made.

### F. Court-sync
- **Prerequisites**: none for the *compute* step (already real, in
  Python); a `milestones` table — missing; resolving the live `cases`
  dual-writer (Section E) — a design decision, not a missing artifact.
- **Exists**: `ecourts_scraper.py`/`ecourts_parser.py` — a genuinely
  working, non-trivial integration, already flagged as "further along
  than v0.2 assumed" in the original S1 audit.
- **Missing**: the poll/diff/snapshot model, `hearing.scheduled/.completed`
  event emission, automated nightly scheduling (Section F/I gap).
- **Complexity**: moderate — real logic exists to build on, unlike C/E/G,
  but wiring it into "Node polls, Python only computes" (v0.2's stated
  boundary) means either calling the existing Python scrape+parse code
  *from* Node, or narrowing Node's ownership to just the storage/
  versioning layer while scraping stays in Python temporarily.
- **Security implications**: low — the fabricated-CNR issue already found
  and removed in S1; otherwise this is real external data.
- **Data ownership**: **this is the one candidate where the dual-writer
  risk (Section E) is not hypothetical — it is already happening, today,
  on every real eCourts search request.**
- **FastAPI coexistence**: already the sole writer of `cnr`/`ecourts_data`
  — any Node ownership here must explicitly address, not silently
  inherit, that.
- **Event dependencies**: `hearing.scheduled/.completed` consumers
  (scheduler) don't exist — soft dependency.
- **Downstream unblocked**: scheduling's `pre_hearing`/`post_hearing`
  triggers, the `intimidation_before_hearing` triage rule's
  `daysToHearing` fact.
- **Leaves blocked**: automated (vs. request-triggered) sync, without
  Section F/I infra.

### G. Channel-gateway
- **Prerequisites**: a session model (missing), `agent-svc` as a separate
  service (does not exist — inline in FastAPI today), a turn-envelope
  contract (missing), WebSocket infra in Node (missing).
- **Exists**: nothing reusable on the Node side; the existing Python
  chatbot endpoint is real but architecturally the opposite of what would
  be ported forward.
- **Complexity**: very high — a from-scratch rebuild, and explicitly named
  out of scope by this task and every prior S6/S7 task.
- **Everything else**: see Section J in full.

### H. Session/conversation foundation (metadata only, no gateway/agent)
- **Prerequisites**: none hard.
- **Exists**: `interactions` (Python-owned, message-level, no session
  grouping) as the only session-adjacent data today.
- **Missing**: a real `sessions` table (id, victimId, channel, language,
  startedAt, endedAt, crisisTriggered) — v0.2's own shape, minus
  transcript/audio URIs which need the encryption/object-storage
  infrastructure this repo doesn't have yet.
- **Complexity**: low as a pure additive-schema slice, but would be
  **inert** — nothing writes to it, since chat stays in FastAPI unless a
  second slice migrates the endpoint itself.
- **Security implications**: session *metadata* (no content) is
  low-sensitivity; a safe, narrow slice if pursued.
- **Data ownership**: net-new, FastAPI's `interactions` table would
  remain the actual message store either way.
- **FastAPI coexistence**: would not be written to by anything until a
  future slice migrates the chatbot endpoint itself — genuinely dormant
  in the interim, the same pattern S4's original victim-session token was
  in before S5 gave it a real caller.
- **Downstream unblocked**: conceptually, everything in Workflow E (post-
  session pipeline) needs a `session_id` to key off of.
- **Leaves blocked**: without a second slice wiring a real writer to it,
  it stays unused.

### I. Oversight
- **Prerequisites**: aggregate data (exists — `cases`/`counsellors`/
  district fields), S7's staff/district pattern (exists).
- **Exists**: FastAPI's `national_routes.py` (real, redacted) and
  `district_routes.py` (real, but explicitly documented as
  district-unscoped); `state_routes.py` is **100% hardcoded mock data**.
- **Missing**: a Node-owned oversight endpoint (today 100% FastAPI); small-
  count suppression (v0.2: "any cell below 5 is suppressed" — not
  implemented anywhere in any dashboard, FastAPI or Node); the
  state_admin/national_admin role tier has zero Node endpoint access
  (S7 deliberately excluded them from console, since console is
  individual-record and v0.2 says oversight-tier sees aggregates only).
- **Complexity**: low–moderate — structurally close to S7's own work
  (staff auth + role check + query), just aggregation instead of
  individual-record lookup.
- **Security implications**: must genuinely aggregate/suppress, a
  different technique from the field-level PII redaction
  (`pii_redaction.py`) already in use elsewhere.
- **Data ownership**: FastAPI's existing dashboards would remain live —
  the same dual-authority pattern already accepted since S4.
- **FastAPI coexistence**: straightforward, no new risk category.
- **Event dependencies**: none required.
- **Downstream unblocked**: relatively self-contained; doesn't unblock
  other domains.
- **Leaves blocked**: nothing else depends on it either.

### J. Case/victim lifecycle domain foundation (repository-revealed option)
- **Prerequisites**: none — builds directly on S5's existing `Case`
  Prisma model and S7's staff/console authorization pattern.
- **Exists**: the `Case` model (S5), `case_stage_enum` (real, 6 values),
  S7's `StaffAuthGuard`/role/district/ownership pattern.
- **Missing**: any Node-owned, validated write path for `case_stage`; any
  representation of a victim-level pause/opt-out concept at all.
- **Complexity**: low — reuses S5+S7 patterns almost directly; no new
  infrastructure category.
- **Security implications**: **directly closes a verified, concrete
  vulnerability** (Section K) for Node's own new write path — does not
  retroactively fix FastAPI's existing endpoint, which is a coexistence
  decision, not a code defect in the new work.
- **Data ownership**: extends Node's existing `cases` write ownership
  (S5) rather than creating a new table.
- **FastAPI coexistence**: same non-interfering pattern as every prior
  slice — FastAPI's `lifecycle_routes.py` stays live and is not modified.
- **Event dependencies**: none required.
- **Downstream unblocked**: every domain in this document that reads or
  writes lifecycle state (triage's level→lifecycle mapping, referral
  approval, scheduling's must-not-contact-paused/opted-out check, closure/
  opt-out Workflow I) gains a trustworthy foundation instead of an
  arbitrary-string field.
- **Leaves blocked**: the full v0.2 11-state `lifecycle_state` migration
  itself is not attempted here (a larger, separate data-migration
  decision, consistent with S5's prior explicit deferral of this exact
  question).

---

## M. Critical dependency graph

Not forced into a single line — the actual dependency structure is mostly
parallel, with a few hard chains:

```
                    [job queue: Redis/BullMQ]  (infrastructure decision, not built)
                              │
              ┌───────────────┼───────────────────────┐
              ▼               ▼                       ▼
   scheduling/workers   automated court-sync    automated referral SLA
   (checkins, silence   (nightly poll)          (breach escalation)
   ladder, notifier,
   purge)


   [real assessment output]  (analysis-svc work — not a Node migration slice at all)
              │
              ▼
        triage-router  ──────────────▶  task/SLA domain  ──────────────▶  notifier
                                              │
                                              ▼
                                          console review


   [session model]  ──────────────▶  post-session pipeline  ──────────▶  memory / assessment / legal detection
   (Node metadata only,                (needs job queue too)
   independent of channel-gateway)


   [channel-gateway rebuild]  (independent, largest, explicitly out of scope everywhere)


   case/victim lifecycle foundation  (independent — no upstream dependency)
              │
              ├──▶ makes triage's level→lifecycle mapping meaningful
              ├──▶ makes referral approval's case-state effects meaningful
              ├──▶ makes scheduling's must-not-contact-paused check meaningful
              └──▶ makes closure/opt-out (Workflow I) meaningful


   audit hash-chaining  (independent — extends S7, no dependency either way)

   oversight  (independent leaf — depends only on already-existing aggregate data + S7's pattern)

   referral foundation (manual send/ack, no automation)  ──▶ depends on consent (exists) + case data (exists) only
```

**Hard dependencies**: triage → real assessment (missing, not a Node-side
gap — it's analysis-svc/Python work); scheduling → job queue (missing,
an infrastructure decision); automated court-sync/referral-SLA → job
queue; post-session pipeline automation → job queue.

**Soft dependencies**: referral's automated SLA escalation on the job
queue (a manual-only referral foundation does not need it); court-sync's
event emission on a consumer existing (can be emitted into a void
initially); scheduling on lifecycle being authoritative (scheduling would
be *more* correct with real lifecycle, but nothing forces the two to ship
together).

**Independent slices** (no upstream Node-side dependency at all): case/
victim lifecycle foundation, audit hash-chaining, oversight, a referral
foundation without SLA automation, a session-metadata-only table.

**Circular dependencies**: none found.

**Infrastructure prerequisite that must be decided before most
*operational* (as opposed to foundational) workflows can move**: whether
and when to introduce Redis/BullMQ. This is the single largest fork in the
whole graph — everything below it in the diagram is blocked until it's
made, and everything above/beside it is not.

---

## N. Proposed S8 boundary

**Case/victim lifecycle domain foundation** — Node becomes the
authoritative, validated owner of case-stage transitions, and gains a
minimal, additive victim-level pause/opt-out flag.

This satisfies every explicit requirement the task lists for the
proposal: it is incremental (extends S5's `Case` model + S7's
authorization pattern, no new module category); independently testable
(the exact same unit+integration pattern used in S4–S7); compatible with
FastAPI coexistence (FastAPI's `lifecycle_routes.py` is not touched);
additive (one new, small migration — no dropped/renamed columns);
security-first (it closes a verified, concrete, evidence-based
vulnerability rather than a hypothetical one); small enough to review
(comparable in size to S6 or S7, not a rebuild); and useful to downstream
domains (every operational domain examined in this document — triage,
referral, scheduling, closure — reads or writes lifecycle state, and none
of them currently have a trustworthy foundation to build on).

### S8 IN:
- A Node-owned, staff-authenticated, role- and ownership-scoped endpoint
  (reusing S7's `StaffAuthGuard`/`ConsoleService` pattern) that updates
  `cases.case_stage`, validated against the real 6-value enum — no
  arbitrary string accepted.
- Transition-validity enforcement (e.g. `closed` cannot go back to
  `registered`) — the specific gap found in Section K.
- A minimal, additive victim-level flag (e.g. on `victim_profiles`, S6's
  existing 1:1-extension table) representing "opted out of outbound
  contact" — not the full 11-state `lifecycle_state` machine, just the
  one boolean-shaped concept the event catalog names
  (`victim.opted_out`) and multiple downstream domains (scheduling,
  notifier) will need to check before this repository can safely build
  any outbound-contact feature.
- An audit-hook call into S7's existing `StaffAuditService` for every
  staff-initiated stage change (extends the existing pattern; does not
  require hash-chaining).
- A migration document (`docs/S8_LIFECYCLE_MIGRATION.md`, if S8 proceeds)
  tracing exactly which future domains this unblocks and which it
  explicitly does not (see Out list).

### S8 OUT:
- The full v0.2 11-state `lifecycle_state` machine (a larger, separate
  data-migration decision, consistent with S5's prior deferral).
- Any change to FastAPI's existing `lifecycle_routes.py` (coexistence
  only — the vulnerability there is left in place, documented, not fixed
  at the source, matching every prior slice's FastAPI-untouched
  discipline).
- Job queue / Redis / BullMQ introduction.
- Any of triage, scheduling, referral, court-sync, channel-gateway,
  session/conversation, memory, assessment, legal detection, oversight,
  full audit hash-chaining.
- Any frontend/mobile change.
- Any automated enforcement of the opt-out flag (e.g. actually cancelling
  scheduled outreach) — nothing schedules outreach yet, so there is
  nothing to cancel; the flag exists so a *future* scheduling slice has
  something correct to check from day one.

---

## O. S8 → S9 → S10 dependency path (derived, not assumed)

The task's own example (S8→S9→S10 as a strict line) is explicitly flagged
as possibly wrong — and the evidence in Section M shows the real graph is
mostly parallel, not linear. The most defensible derived sequence, given
the proposed S8:

```
S8: case/victim lifecycle foundation
       │
       ├──▶ S9 (one of, independently, not necessarily in this order):
       │     • Referral foundation (manual send/ack) — now has a
       │       trustworthy case-state signal to condition on, though it
       │       does not strictly require S8 to start
       │     • Audit hash-chaining — independent of S8, could equally be
       │       S9 or run in parallel
       │     • Oversight — independent leaf, could equally be S9
       │
       └──▶ S10 (blocked on an infrastructure decision, not on S8 or S9):
             • Scheduling/workers foundation — requires the Redis/BullMQ
               decision (Section F/I) regardless of what S9 was; S8's
               opt-out flag and lifecycle validity make it meaningfully
               safer once that decision is made, but do not remove the
               infrastructure blocker itself
             • Triage-router — requires real assessment output (Python/
               analysis-svc work, not unblocked by any Node migration
               slice)
```

S8 does not, by itself, unblock scheduling or triage — it removes one
real precondition (a trustworthy lifecycle signal) from each of their
checklists, without removing their harder blockers (job queue,
real assessment). This is stated plainly rather than overclaiming S8's
downstream effect.

---

## P. Risks (only those supported by actual code/spec evidence)

- **Dual writers on `cases`, live today**: Python (`ecourts_routes.py`
  writes `cnr`/`ecourts_data`; `lifecycle_routes.py` writes `case_stage`
  with no validation) and Node (S5 writes `case_type`/
  `assignedCounsellorId` at creation) both write the same table with no
  coordination. Confirmed by reading both code paths, not inferred.
- **Unvalidated lifecycle writes**: any of five staff roles can set
  `case_stage` to an arbitrary string via the existing FastAPI endpoint —
  confirmed by reading `lifecycle_routes.py` (Section K).
- **Fabricated-looking assessment output presented as real**: `fusion.py`
  is a keyword-match simulation, but its output (`final_score`,
  `escalation_risk`) is written to `cases` and displayed to staff
  identically to how real model output would be — nothing in the API
  response or the stored row distinguishes "simulated" from "real."
  Relevant to any future slice that reads these fields as if they were
  trustworthy.
- **Mocked oversight data presented as real**: `state_routes.py` returns
  hardcoded numbers with no indication they are not live — the same
  concern as above, for a different endpoint.
- **RLS assumptions**: as documented across S4–S7 and re-confirmed in
  S7's own audit, the backend connects via a service-role credential that
  bypasses RLS entirely for every table, in both FastAPI and Node. No
  code path in this repository currently relies on RLS for isolation —
  worth restating here because any S8+ slice must not assume RLS provides
  a safety net it does not.
- **Prisma transaction boundaries**: S5's `RegistrationService` already
  establishes the pattern (a single `$transaction` covering multi-step
  writes) — any lifecycle-transition write spanning more than one row
  (e.g. a stage change plus an audit-log entry) should follow that same
  pattern; not doing so would be a new, avoidable risk, not an existing
  one.
- **Background-worker concurrency**: not currently applicable — no worker
  process exists (Section F). The one background-adjacent code
  (`check_and_escalate_sos`) runs as a single in-process asyncio loop, not
  a pool, so no concurrency hazard currently exists there either; this
  changes the moment any real job-queue worker is introduced.
- **Sensitive information in logs**: not found in any S8-relevant code
  path examined for this audit; S7's own audit already confirmed this for
  the staff/console module specifically.

---

## Q. Required tests for the proposed S8 boundary (not written yet)

- **Unit**: enum validation (a value outside the real 6-value
  `case_stage_enum` is rejected); transition-validity rules (e.g. a
  specific disallowed transition is rejected, a specific allowed one
  succeeds); opt-out flag set/unset via the same PATCH-style pattern S6
  established for `victim_profiles`.
- **Integration** (real disposable Postgres, `pg-harness.ts` pattern):
  a staff member with the right role+ownership can transition a real
  case's stage; a staff member without ownership/role cannot; an
  unauthenticated or victim-token request is rejected (mirroring S7's
  security-test list exactly); the audit hook records the transition
  with an id/code only, never free text.
- **Database tests**: the new migration applies cleanly and is additive
  only (same automated grep-for-destructive-statements test S6/S7 both
  used).
- **Authorization tests**: cross-district denial, cross-assignment
  denial, and the same "unrelated ids cannot accidentally authorize"
  property S7 proved for `staff.counsellorId`, reapplied to whatever
  ownership check lifecycle transitions use.
- **Concurrency tests**: two concurrent transition requests for the same
  case do not produce an inconsistent state (a real Postgres test,
  following S5's concurrency-test precedent for counsellor assignment).
- **Migration tests**: the new column(s)/table additions apply cleanly
  against the real `schema.sql` + all prior migrations, exactly as every
  S4–S7 migration was verified via real introspection before being
  written into `schema.prisma`.
- **Regression tests**: the full existing Node unit + integration suites
  and the full Python suite must still pass unmodified, per every prior
  slice's own discipline.

---

## R. Exact files likely to change (if S8 proceeds — not created here)

- `backend/migrations/0006_*.sql` (new, additive)
- `apps/core-api/prisma/schema.prisma` (extend)
- A new or extended Node module (likely `apps/core-api/src/cases/` or a
  new `apps/core-api/src/lifecycle/`, reusing `StaffAuthGuard`/
  `ConsoleService` patterns)
- `apps/core-api/test/pg-harness.ts` callers — a new integration spec
- `docs/S8_LIFECYCLE_MIGRATION.md` (the implementation-phase doc, distinct
  from this audit)
- **Not** any FastAPI file, **not** any frontend/mobile file — consistent
  with every prior slice.

---

## S. Explicit out-of-scope items

Everything named in this task's own DO-NOT list (implementation files,
migrations, schemas, frontend/mobile, FastAPI) — none were touched to
produce this document. Beyond that, explicitly out of scope for the
*proposed* S8 itself (restated from Section N's OUT list): the full
v0.2 lifecycle state machine, any FastAPI fix, job-queue introduction,
triage, scheduling, referral, court-sync, channel-gateway, session/
conversation, memory, assessment, legal detection, oversight, and full
audit hash-chaining.
