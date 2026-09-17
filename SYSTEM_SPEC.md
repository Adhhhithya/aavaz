# SYSTEM_SPEC.md
## AI-Powered Dynamic Mental Health Monitoring and Distress Prediction System
### Smart India Hackathon — Problem Statement 26094 (MoSJE)

---

## 1. Executive Plan & Scope

### 1.1 Core Value Proposition

Victims, witnesses, and families registered under the SC/ST (Prevention of Atrocities) Act, 1989 currently receive legal and financial support but no continuous psychological monitoring across the investigation → trial → compensation → rehabilitation pipeline. This system closes that gap by:

- Proactively and periodically contacting registered persons across multiple channels (IVR, SMS, chatbot, app)
- Fusing acoustic, sentiment, emotion, engagement, and case-history signals into a single explainable **Distress Score**
- Predicting escalation before crisis, auto-recommending interventions, and auto-alerting the right human (counsellor → district → state → national) with a 30-minute SOS escalation guarantee
- Tracking every case through its full lifecycle, not just at the helpline-intake moment

### 1.2 MVP Boundary (build for hackathon demo)

**In scope:**
- **Primary Intake:** Inbound IVR (Bolna/Sarvam). High-score IVR calls trigger case registration.
- App + SMS + chatbot intake available for post-registration check-ins and SOS. (Note: Portal/App/FIR simulation for initial registration removed to match primary workflow).
- Full scoring pipeline: acoustic (OpenSMILE) + sentiment + emotion (text + acoustic valence-arousal) + engagement
- Regression-based Prediction Engine for predicting `predicted_escalation_risk`.
- Rules-based intervention recommendation engine
- Case lifecycle field (Registered → Investigation → Trial → Compensation → Rehabilitation → Closed) with simulated court/CCTNS-style updates
- Counsellor auto-assignment, permanent per case, with 30-minute SOS auto-escalation and stop/resolve action
- District / State / National / Counsellor dashboards, tiered PII visibility
- Leaflet.js + OpenStreetMap SOS live-location map (district view)
- Longitudinal trend visualization per case
- Explainability breakdown (weighted score components) shown per interaction
- Consent capture (app first-login; short opt-out line on non-app channels)
- Multilingual: Hindi, Tamil, Malayalam, English
- Supabase (Postgres + Storage) backend via FastAPI

**Out of scope for MVP (backlog):**
- Live integration with real NHAA, CCTNS, ICJS, or eCourts systems (no open public APIs exist today — documented as a future integration point requiring formal government API access)
- SHAP-level sub-model explainability (weighted breakdown is sufficient for MVP)
- Full custom-trained emotion classifier (MVP uses LLM-prompted classification + OpenSMILE valence-arousal heuristic, not a trained model)
- Languages beyond Hindi/Tamil/Malayalam/English
- Automated policy-recommendation generation at the national dashboard (MVP shows analytics only, not prescriptive policy text)
- Native mobile offline mode
- SMS end-to-end encryption beyond Pushbullet's defaults

### 1.3 Out-of-Scope Backlog (post-hackathon roadmap)

| Item | Reason deferred |
|---|---|
| Real CCTNS/ICJS/eCourts API integration | No open public API; requires formal MoSJE/MHA partnership |
| Trained emotion-recognition model (fine-tuned) | Time constraint; heuristic approach sufficient for MVP accuracy demo |
| SHAP-based sub-model explainability | Nice-to-have, not required for core XAI compliance |
| Additional regional languages | Scope control; Bolna/Sarvam + IndicBERT coverage prioritized for 4 launch languages |
| Formal clinical validation of distress score | Requires domain expert / longitudinal real-world data, outside hackathon timeline |

---

## 2. User Roles, Permissions & Task Workflows

### 2.1 Roles

| Role | Description |
|---|---|
| **Victim/Witness/Family (End User)** | Registers, receives outbound contact, can trigger SOS |
| **Counsellor** | Assigned cases, manual intervention, resolves SOS/alerts |
| **District Officer** | Views district dashboard, SOS map, reassigns/oversees counsellors |
| **State Officer** | Views aggregated state dashboard, resource allocation |
| **National Administrator** | Views national analytics, policy-level trends |
| **System/Automation Actor** | Auto-assignment engine, scoring pipeline, escalation engine (non-human, but has defined permissions in the data model) |

### 2.2 Role-Based Access Matrix

| Capability | End User | Counsellor | District | State | National |
|---|---|---|---|---|---|
| Register case (any channel) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Trigger SOS | ✅ | ❌ | ❌ | ❌ | ❌ |
| Stop/resolve own SOS | ✅ | ✅ (assigned case) | ✅ (escalated case) | ❌ | ❌ |
| View own case detail (score, history) | ✅ (own only) | ✅ (assigned cases) | ✅ (district cases, full PII) | ❌ (aggregate only) | ❌ (aggregate only) |
| View raw transcript/audio | ❌ | ✅ (assigned cases) | ✅ (with access log) | ❌ | ❌ |
| Manually log intervention | ❌ | ✅ | ✅ | ❌ | ❌ |
| Reassign counsellor | ❌ | ❌ | ✅ | ❌ | ❌ |
| View SOS live map | ❌ | ❌ | ✅ | ❌ | ❌ |
| View district-level aggregate stats | ❌ | ❌ | ✅ | ✅ | ✅ |
| View state-level comparative stats | ❌ | ❌ | ❌ | ✅ | ✅ |
| View national policy analytics | ❌ | ❌ | ❌ | ❌ | ✅ |
| Update case lifecycle stage | ❌ | ✅ | ✅ | ❌ | ❌ |

All PII-bearing access above district level requires aggregation/anonymization; any drill-down to individual PII at state/national tier must be justified and access-logged (out of MVP scope — flag as backlog item, log the requirement in code comments).

### 2.3 Core Task Workflows

**Workflow A — Case Registration (Inbound IVR Priority)**
1. Victim calls IVR System (Inbound call via Bolna)
2. Audio & Transcript sent through scoring pipeline (acoustic, sentiment, emotion, engagement)
3. If Dynamic Score is High $\rightarrow$ Alert fired to Counsellor
4. Counsellor calls Victim $\rightarrow$ Case record officially created in `cases` table (`status = Registered`)
5. If score is Low $\rightarrow$ System schedules a follow-up outbound call for next week.

**Workflow B — Periodic Interaction & Scoring**
1. Scheduled "follow-up next week" triggers an outbound IVR call
2. Response captured $\rightarrow$ sent through scoring pipeline (acoustic, sentiment, emotion, engagement)
3. New row appended to `interactions` table with computed `final_score`
4. Regression engine predicts `predicted_escalation_risk` based on trend
5. If risk is high $\rightarrow$ Intervention engine recommends action from Enum list $\rightarrow$ Alert fired to counsellor

**Workflow C — SOS Trigger**
1. User presses SOS in-app
2. GPS location captured, alert immediately pushed to assigned counsellor + district dashboard (map pin)
3. 30-minute timer starts
4. If unresolved at 30 min → auto-escalate to next available counsellor in district
5. Either user or counsellor can mark SOS resolved → status logged, timer cleared

**Workflow D — Case Lifecycle Update**
1. Counsellor/district officer (or simulated CCTNS/eCourts feed) posts a stage update
2. `case_stage` field updated, `court_update` row appended to `interactions`/`case_updates`
3. Lifecycle change reflected instantly on longitudinal trend view

---

## 3. Technical Architecture & Directory Layout

### 3.1 Stack Selection

| Layer | Technology | Rationale |
|---|---|---|
| Backend API | FastAPI (Python) | Async, fast to build, good fit for AI pipeline orchestration |
| Database | Supabase (Postgres) | Managed Postgres + Auth + Storage + RLS in one platform |
| File/Media Storage | Supabase Storage buckets | Raw audio/transcript blobs, referenced by row |
| Acoustic Analysis | OpenSMILE | Established toolkit for prosodic/stress feature extraction |
| NLU (multilingual) | IndicBERT | Sentiment/intent/entity extraction in Indic languages |
| Conversational Generation | LLM wrapper (e.g., Gemini API) | Chatbot + SMS dialog generation on top of IndicBERT NLU |
| Voice/IVR | Bolna (with Sarvam models) | Multilingual real-time voice agent, handles Hindi/Tamil/Malayalam/English natively |
| SMS | Pushbullet API | Two-way SMS for registration, alerts, chatbot-over-SMS |
| Frontend (dashboards) | React + Tailwind | Standard, fast to iterate for multi-role dashboards |
| Mapping | Leaflet.js + OpenStreetMap tiles | No API key/billing dependency, good for live demo |
| Charts | Recharts | Longitudinal trend visualization |
| PII Redaction | NER-based redaction service | Pre-storage/pre-display scrubbing for tiered access |

### 3.2 Directory Layout

```
project-root/
├── .antigravityrules
├── SYSTEM_SPEC.md
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── api/
│   │   ├── intake/
│   │   │   ├── app_routes.py
│   │   │   ├── ivr_webhook.py        # Bolna webhook receiver
│   │   │   ├── sms_webhook.py        # Pushbullet webhook receiver
│   │   │   ├── chatbot_routes.py
│   │   │   └── simulated_nhaa_fir.py # mocked intake endpoints
│   │   ├── cases/
│   │   │   ├── case_routes.py
│   │   │   ├── lifecycle_routes.py
│   │   │   └── sos_routes.py
│   │   ├── scoring/
│   │   │   ├── acoustic.py           # OpenSMILE wrapper
│   │   │   ├── sentiment_emotion.py  # IndicBERT + emotion classification
│   │   │   ├── engagement.py
│   │   │   ├── fusion.py             # weighted score combiner
│   │   │   └── predictor.py          # escalation prediction
│   │   ├── interventions/
│   │   │   └── rules_engine.py
│   │   ├── assignment/
│   │   │   ├── auto_assign.py
│   │   │   └── escalation.py         # 30-min SOS timer logic
│   │   ├── dashboards/
│   │   │   ├── district_routes.py
│   │   │   ├── state_routes.py
│   │   │   ├── national_routes.py
│   │   │   └── counsellor_routes.py
│   │   └── auth/
│   │       └── auth_routes.py
│   ├── models/                       # Pydantic schemas
│   ├── services/
│   │   ├── supabase_client.py
│   │   ├── pii_redaction.py
│   │   ├── location_resolver.py      # first-channel-wins logic
│   │   └── translation.py            # IndicTrans2/Bhashini if needed
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/                      # end-user mobile/web app views
│   │   ├── dashboards/
│   │   │   ├── District/
│   │   │   ├── State/
│   │   │   ├── National/
│   │   │   └── Counsellor/
│   │   ├── components/
│   │   │   ├── SOSMap.jsx            # Leaflet + OSM
│   │   │   ├── TrendChart.jsx        # Recharts longitudinal view
│   │   │   └── ScoreBreakdown.jsx    # XAI component
│   │   └── lib/
│   └── tests/
└── docs/
    ├── compliance_notes.md
    └── architecture_diagrams/
```

### 3.3 `.antigravityrules` — Coding Standards

```
# .antigravityrules

## General
- Python backend: PEP8, type hints mandatory on all function signatures
- Async-first: all I/O (DB, external API, webhook) calls must be async
- No business logic in route handlers — routes call services/, services call models/

## Naming
- snake_case for Python, camelCase for JS/React
- DB tables: plural snake_case (e.g., `interactions`, `cases`)
- API routes: /api/v1/{resource}/{action}

## Data & Privacy
- Never log raw PII (name, phone, transcript text) to console/stdout
- All PII fields must pass through pii_redaction service before any non-district-tier response
- Raw audio/transcripts only in Supabase Storage buckets, never inline in API responses

## Scoring Pipeline
- Every score computation must return a breakdown object (component values + weights), never just a final number — required for XAI compliance
- All scoring functions must be pure (no side effects) and independently testable

## Error Handling
- All external API calls (Bolna, Pushbullet, LLM wrapper) wrapped in try/except with fallback/retry, never allowed to crash the intake pipeline
- Failed scoring on one signal (e.g., acoustic fails) must degrade gracefully — reweight remaining signals, do not block the interaction record

## Testing
- Minimum: unit tests for fusion.py, rules_engine.py, auto_assign.py, escalation.py before merging
- Webhook handlers require a mocked-payload test before integration testing

## Git/Commits
- Conventional commits (feat:, fix:, docs:, refactor:)
- No direct commits to main; feature branches only
```

---

## 4. Data Models & Schema Specifications

### 4.1 Entity Relationship Overview

```
users (1) ──< cases (1) ──< interactions (many)
                  │
                  ├──< case_updates (many)   [court/lifecycle stage changes]
                  ├──< sos_events (many)
                  └──> counsellors (assigned_counsellor_id)

counsellors (many) ──> districts (1)
districts (many) ──> states (1)
```

### 4.2 Core Tables

**`users`**
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| phone_number | text, unique, encrypted | |
| name | text, encrypted | PII |
| role_type | enum('victim','witness','family') | |
| preferred_language | enum('hi','ta','ml','en') | |
| consent_given | boolean | default false |
| consent_timestamp | timestamptz | |
| location_district | text | first-channel-wins, permanent once set |
| location_state | text | |
| location_source | enum('ivr','sms','app') | which channel set it first |
| location_lat | float, nullable | app-only |
| location_lng | float, nullable | app-only |
| created_at | timestamptz | |

Index: `phone_number` (unique), `location_district` (for district dashboard filtering)

**`cases`**
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → users | |
| case_type | text | e.g., rape, murder, grievous hurt, arson, caste violence |
| intake_channel | enum('nhaa_sim','fir_sim','ivr','app','sms','chatbot') | |
| case_stage | enum('registered','investigation','trial','compensation','rehabilitation','closed') | |
| assigned_counsellor_id | uuid, FK → counsellors, nullable | permanent once set |
| current_distress_score | float | denormalized latest score, for fast dashboard sort |
| predicted_escalation_risk | enum('low','medium','high') | Output of regression prediction model |
| priority_rank | int | computed: score + case_type tiebreaker |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Index: `assigned_counsellor_id`, `case_stage`, `current_distress_score` (for priority-sorted queue), composite index on `(location_district, current_distress_score)` for district dashboard.

**`interactions`** (append-only)
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| case_id | uuid, FK → cases | |
| timestamp | timestamptz | |
| channel | enum('ivr','sms','chatbot','app') | |
| acoustic_score | float, nullable | null if text-only channel |
| sentiment_score | float | |
| emotion_tag | enum('fear','anger','sadness','hopelessness','neutral') | |
| engagement_score | float | disengagement metric |
| final_score | float | fused weighted score (history_score removed) |
| score_breakdown | jsonb | XAI component contributions |
| transcript_ref | text, nullable | pointer to Supabase Storage object |
| audio_ref | text, nullable | pointer to Supabase Storage object |
| intervention_recommended | enum | 'counselling', 'medical_treatment', 'witness_protection', 'relocation_support', 'financial_assistance', 'legal_aid', 'rehabilitation_measures' |

**`applied_interventions`**
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| case_id | uuid, FK → cases | |
| counsellor_id | uuid, FK → counsellors | |
| interaction_id | uuid, FK → interactions | The interaction that triggered this |
| intervention_type | enum | Matches `intervention_recommended` enum |
| applied_at | timestamptz | |
| efficacy_notes | text | Counsellor notes |
| result_score_delta | float, nullable | Change in `final_score` at the next interaction (for efficacy tracking) |

Index: `case_id, timestamp` composite (for longitudinal trend queries — this is the primary access pattern, must be indexed for performance)

**`case_updates`** (lifecycle/court stage changes)
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| case_id | uuid, FK → cases | |
| timestamp | timestamptz | |
| previous_stage | text | |
| new_stage | text | |
| update_source | enum('manual','simulated_cctns','simulated_ecourts') | |
| notes | text, nullable | |

**`sos_events`**
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| case_id | uuid, FK → cases | |
| triggered_at | timestamptz | |
| location_lat | float | |
| location_lng | float | |
| assigned_counsellor_id | uuid, FK → counsellors | |
| escalated | boolean | default false |
| escalated_at | timestamptz, nullable | |
| escalated_to_counsellor_id | uuid, nullable | |
| resolved | boolean | default false |
| resolved_by | enum('user','counsellor'), nullable | |
| resolved_at | timestamptz, nullable | |

Index: `resolved` (partial index where `resolved = false`, for fast active-SOS lookups by the escalation cron job)

**`counsellors`**
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| district | text | |
| languages | text[] | |
| current_caseload | int | denormalized, updated on assignment/resolution |

Index: `(district, current_caseload)` — used directly by auto-assignment query.

### 4.3 Caching Strategy

- **District/State/National dashboard aggregates**: cache in Redis (or Supabase Edge Function + materialized view) with 60-second TTL — these are read-heavy, don't need real-time-to-the-second accuracy.
- **SOS map data**: no caching — must be live, poll every 5–10 seconds or use Supabase Realtime subscriptions on `sos_events`.
- **Trend chart data**: cache per-case for 5 minutes; invalidate on new `interactions` insert for that case.

---

## 5. Data Flow & API Contracts

### 5.1 Intake Payload Schemas

**IVR webhook (Bolna → backend)**
```json
{
  "call_id": "string",
  "user_phone": "string",
  "transcript": "string",
  "audio_url": "string",
  "language_detected": "hi|ta|ml|en",
  "duration_seconds": "number",
  "call_status": "completed|missed|failed"
}
```

**SMS webhook (Pushbullet → backend)**
```json
{
  "from_number": "string",
  "message_body": "string",
  "timestamp": "ISO8601"
}
```
Structured sub-formats expected within `message_body`:
- Location: `LOC <District>,<State>,<Pincode>`
- Role: `ROLE <1|2|3>` (1=Victim, 2=Witness, 3=Family)

**Chatbot message (App/Web → backend)**
```json
{
  "user_id": "uuid",
  "session_id": "uuid",
  "message": "string",
  "channel": "app|sms"
}
```

**App registration**
```json
{
  "phone_number": "string",
  "name": "string",
  "role_type": "victim|witness|family",
  "consent_given": true,
  "location": { "lat": "number", "lng": "number" },
  "preferred_language": "hi|ta|ml|en"
}
```

### 5.2 Scoring Pipeline Contract (internal)

```json
POST /internal/scoring/compute
{
  "case_id": "uuid",
  "channel": "ivr|sms|chatbot|app",
  "transcript": "string",
  "audio_url": "string|null"
}

Response:
{
  "final_score": 78,
  "score_breakdown": {
    "acoustic": { "weight": 0.5, "contribution": 39, "notes": "elevated pitch variance" },
    "sentiment": { "weight": 0.3, "contribution": 20, "notes": "negative markers" },
    "engagement": { "weight": 0.2, "contribution": 14, "notes": "2 missed follow-ups" }
  },
  "emotion_tag": "fear",
  "intervention_recommended": "witness_protection_escalation"
}
```

### 5.3 State Transitions

**Case Stage**
```
Registered → Investigation → Trial → Compensation → Rehabilitation → Closed
```
Transitions are one-directional except manual admin correction (logged in `case_updates` with `update_source = manual`).

**SOS Event**
```
Triggered → (unresolved, 30 min) → Escalated → Resolved
Triggered → Resolved (directly, if handled within 30 min)
```

### 5.4 Third-Party Integration Points

| Service | Direction | Purpose |
|---|---|---|
| Bolna API | Outbound (backend → Bolna) | Trigger outbound IVR calls |
| Bolna Webhook | Inbound (Bolna → backend) | Receive call transcript + audio + STT payload |
| Pushbullet API | Bidirectional | Send/receive SMS |
| LLM Wrapper API (Gemini or similar) | Outbound | Chatbot response generation, emotion classification prompt |
| Supabase | Bidirectional | DB + Auth + Storage + Realtime |
| Simulated CCTNS/eCourts | Mocked internal endpoint | Case-stage update feed (stand-in for real future integration) |

---

## 6. Security, Auth & Edge-Case Strategy

### 6.1 Auth Flows

- **End users**: phone-number-based OTP auth (via Supabase Auth) for app; IVR/SMS users identified by phone number matched to existing `users` record (no login required for those channels)
- **Counsellors/District/State/National staff**: email + password via Supabase Auth, role claim stored in JWT, enforced via Supabase Row-Level Security (RLS) policies matching the access matrix in Section 2.2
- **Service-to-service** (webhooks from Bolna/Pushbullet): shared-secret header validation, not user-level auth

### 6.2 Row-Level Security (RLS) Enforcement

- `interactions`, `cases`: RLS policy restricts row visibility by `assigned_counsellor_id` (counsellor tier) or `location_district` (district tier); state/national queries only hit aggregate views, never raw tables directly
- `users`: PII fields (name, phone) masked at the view layer for state/national roles

### 6.3 Error Handling Protocols

| Failure Point | Handling |
|---|---|
| OpenSMILE acoustic extraction fails | Degrade gracefully — reweight fusion using sentiment+engagement+history only, flag `acoustic_unavailable: true` in breakdown |
| Bolna call fails/no answer | Log as missed call → feeds engagement score (disengagement signal), retry per follow-up schedule, do not treat as system error |
| LLM wrapper timeout/error | Fallback to template-based response for chatbot; do not block scoring pipeline on generation failure |
| Pushbullet delivery failure | Retry with backoff (3 attempts); log to admin alert if all fail |
| Supabase write failure on interaction insert | Queue for retry (local buffer/dead-letter table); never silently drop an interaction record |
| SOS escalation cron fails to fire | Redundant check: escalation eligibility also verified on every district dashboard poll, not solely dependent on the cron job |

### 6.4 Validation Rules

- Phone numbers: E.164 format validation before any write
- Location SMS format: regex-validated (`LOC <text>,<text>,\d{6}`); malformed input triggers a re-prompt SMS, not a silent failure
- Score fusion: weights must sum to 1.0 — enforced by a unit test, not just documentation
- Role type: must be one of the three enum values; unclassified intake blocks case creation until resolved (cannot silently default to "victim")
- Consent: `consent_given = false` blocks any outbound automated contact — enforced at the scheduling layer, not just intake

### 6.5 Edge Cases

- **User contacts via multiple channels before location is set**: first successful write wins (enforced via a `location_source` check-and-set, not last-write-wins, to prevent race conditions)
- **Same phone number, multiple case types over time**: each new atrocity report creates a new `case_id` under the same `user_id`, so history scoring can still reference the person's prior case load without conflating unrelated case timelines
- **Counsellor resigns/unavailable mid-case**: manual district-officer reassignment override permitted (breaks "permanent assignment" only via explicit admin action, logged)
- **SOS resolved by user, but counsellor later disagrees it's genuinely resolved**: counsellor can reopen — resolution status supports a `reopened` sub-state, not just a binary flag

---

## 7. Phased Implementation Roadmap

### Phase 0 — Foundation (Setup)
- Supabase project setup, schema migration from Section 4
- FastAPI skeleton with route structure from Section 3.2
- `.antigravityrules` applied, CI lint/test pipeline running
- **Verification**: schema deploys cleanly, health-check endpoint returns 200, RLS policies pass a basic access-matrix test suite

### Phase 1 — Core Intake
- App registration + consent flow
- Simulated NHAA/FIR mock endpoints
- IVR integration (Bolna outbound + webhook)
- SMS integration (Pushbullet, structured LOC/ROLE parsing)
- Chatbot basic flow (LLM wrapper + IndicBERT NLU)
- **Verification**: a test case can be created via all 4 real channels + 2 simulated ones; location first-channel-wins logic passes race-condition test; consent gate blocks outbound contact when false

### Phase 2 — Scoring Pipeline
- OpenSMILE acoustic integration
- Sentiment + emotion classification (IndicBERT + LLM prompt)
- Engagement score computation
- Fusion engine (weighted score + breakdown object)
- Predictive escalation model (trend-based)
- **Verification**: unit tests on fusion.py confirm weights sum to 1.0 and degrade gracefully on missing signal; sample interactions produce sane emotion_tag/score pairs reviewed manually against expected direction (e.g., high-stress sample transcript scores high)

### Phase 3 — Interventions, Assignment & Escalation
- Rules-based intervention engine
- Counsellor auto-assignment (least-caseload + language match)
- SOS trigger flow + 30-minute escalation timer + stop/resolve actions
- **Verification**: simulated SOS event auto-escalates correctly at 30-minute mark in test environment (accelerated clock); assignment always resolves to a counsellor with matching language when one exists

### Phase 4 — Case Lifecycle & Longitudinal Data
- Case stage tracking + `case_updates` table
- Simulated CCTNS/eCourts feed for stage updates
- Longitudinal trend chart (Recharts) per case
- **Verification**: a case moved through all 6 lifecycle stages renders correctly on the trend chart with stage markers overlaid on the score timeline

### Phase 5 — Dashboards
- Counsellor dashboard (assigned queue, resolution status)
- District dashboard (priority queue, SOS map via Leaflet+OSM, reassignment)
- State dashboard (aggregates, resource allocation view)
- National dashboard (comparative analytics)
- Score breakdown / XAI component on all case-detail views
- **Verification**: RLS-enforced access matrix manually tested per role (a district-tier login cannot query another district's PII; state/national logins never receive raw PII fields in API responses)

### Phase 6 — Compliance, Polish & Demo Prep
- PII redaction pipeline finalized and applied at all non-district-tier response paths
- Compliance documentation (`docs/compliance_notes.md`): consent handling, DPDP-alignment notes, simulated-vs-real integration disclosures for NHAA/FIR/CCTNS/eCourts
- End-to-end demo script: registration → follow-up call → score → alert → counsellor action → SOS → escalation → dashboard views across all 4 tiers
- **Verification**: full demo run-through completes without manual intervention outside scripted actions; all PS 26094 Innovation Components (Emotion AI, Voice Stress Analytics, Sentiment Analysis, Predictive Risk Modelling, Multilingual Conversational AI, Explainable AI, Automated Case Prioritisation, Real-Time Risk Alerts) are demonstrably visible in the walkthrough

### Testing Strategy Summary

| Level | Approach |
|---|---|
| Unit | fusion.py, rules_engine.py, auto_assign.py, escalation.py, location_resolver.py |
| Integration | Webhook payload → DB row → dashboard read (per channel) |
| Access control | RLS policy test suite covering full Section 2.2 matrix |
| End-to-end | Scripted demo path covering all 6 phases in sequence |
| Manual/qualitative | Emotion tag and score sanity review on sample transcripts before demo day |
