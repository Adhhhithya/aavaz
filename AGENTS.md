# Antigravity Rules for SIH Project

## Core Rule
- **Always read and check `SYSTEM_SPEC.md`** before making any architectural decisions, generating code, or modifying the project structure.
- **Problem Statement Context:** Always align code and architecture with the goals and constraints defined in the SIH Problem Statement appended below.

## General
- Python backend: PEP8, type hints mandatory on all function signatures
- Async-first: all I/O (DB, external API, webhook) calls must be async
- No business logic in route handlers — routes call `services/`, services call `models/`
- **Current Ngrok URL:** `https://desirae-nonfeldspathic-pinnately.ngrok-free.dev` (Use this for all webhooks and external links)

## Naming
- `snake_case` for Python, `camelCase` for JS/React
- DB tables: plural snake_case (e.g., `interactions`, `cases`)
- API routes: `/api/v1/{resource}/{action}`

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
- Minimum: unit tests for `fusion.py`, `rules_engine.py`, `auto_assign.py`, `escalation.py` before merging
- Webhook handlers require a mocked-payload test before integration testing

## Git/Commits
- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)
- No direct commits to main; feature branches only

---

## SIH Problem Statement Context

**Title:** AI-Powered Dynamic Mental Health Monitoring and Distress Prediction System for Victims of Atrocities

**Description:**
Victims of atrocities frequently experience prolonged psychological distress after complaint registration due to threats, intimidation, repeated court appearances, delays in investigation and trial, social ostracism, economic hardship, and rehabilitation challenges. Existing mechanisms focus primarily on legal and financial support and do not provide continuous monitoring of victim well-being.

**Problem Statement:**
Develop an AI-based Dynamic Mental Health Monitoring and Distress Prediction System that continuously monitors and predicts psychological distress among victims and complainants registered through NHAA (14566), the Integrated Portal, chatbot, mobile application, IVRS, or other approved communication channels throughout the investigation, trial, rehabilitation, and compensation process.

**Expected Solution:** The system should:
- Conduct periodic interactions with victims through chatbot, IVRS calls, SMS, mobile applications, web portal, or helpline follow-up mechanisms.
- Analyse voice, text, behavioural responses, and engagement patterns using NLP, Sentiment Analysis, and Emotion AI.
- Generate a Dynamic Distress Score and longitudinal trend analysis.
- Predict escalation of psychological distress before a crisis situation emerges.
- Trigger alerts to counsellors, district authorities, and designated officials when predefined risk thresholds are crossed.
- Recommend appropriate interventions such as counselling, medical treatment, witness protection, relocation support, financial assistance, legal aid, or rehabilitation measures.
- Provide dashboards at district, State, and national levels for monitoring vulnerable victims and high-risk cases.
- Ensure explainable AI, privacy protection, data security, and compliance with applicable legal and ethical standards.
