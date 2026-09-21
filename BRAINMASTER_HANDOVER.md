# Project State Handover: SIH "Aavaz"

## Executive Summary
This document serves as the master context file for any AI agent (like a ChatGPT brainmaster) stepping into the project. It outlines the architecture, what has been completed, and the exact current state of the codebase.

## Repository Architecture

1. **`backend/` (FastAPI + Python)**
   - Core API server for the project.
   - Depends on Supabase for the database, auth, and storage.
   - **Database Migrations:** We recently cleaned up the fragmented migration files into a **single, 100% idempotent SQL script** located at `backend/setup_database.sql`. This script safely creates all tables, custom Enums, adds missing columns, enables Row Level Security (RLS), and sets up RLS policies (including `webhook_events`, `shadow_scoring_evaluations`, `conversations`, and `escalations`).
   - Run via: `uvicorn main:app --reload --port 8000`

2. **`frontend/` (React + Vite)**
   - The web dashboard for District/State/National administrators and Counsellors.
   - Run via: `npm run dev` (Port 5173 by default)

3. **`mobile/` (React Native + Expo)**
   - The mobile app designed for victims/users. Handles registration, consent, and SOS triggers.
   - Run via: `npx expo start -c` (Tested primarily via the Expo Go app on physical devices).

4. **`voice-agent/` (Python, UV)**
   - A standalone real-time speech-to-speech voice agent (faster-whisper ASR, streaming LLM, Piper TTS).
   - Manages its dependencies via `uv`.

## Key Integration Points & Webhooks

- **Ngrok Tunneling:** The backend requires a public URL to receive webhooks from **Bolna** (for IVR calls) and **Pushbullet** (for SMS). This is managed via an ngrok tunnel.
- **VS Code Tasks:** The `.vscode/tasks.json` has been configured with a `"🚀 Start All Services"` task that properly boots the Backend (8000), Frontend (5173), Mobile (Expo), and Ngrok (forwarding port 8000 for backend webhooks) in split terminals.

## Current State & Next Steps

If you are an AI picking up this task, here is what is left to do or guide the user through:

1. **Database Execution:** The user possesses `setup_database.sql`. They need to run it in the Supabase SQL Editor. The script handles everything (including RLS), so no manual UI clicking is needed for schema setup.
2. **Webhook Registration:** The user must manually take the ngrok URL (found in `.env` as `PUBLIC_WEBHOOK_BASE_URL`) and register it in their Bolna and Pushbullet dashboards. If ngrok restarts and changes the URL, the dashboards must be updated.
3. **RLS Verification:** The SQL script sets up RLS, but the user must test it by logging in as a dummy "Victim" and dummy "Counsellor" to ensure data isolation works perfectly.
4. **App & Voice Tuning:** 
   - Expo Go needs to be tested on a physical phone to verify location and push notification behaviors.
   - **Voice Models & LLM (Bolna/Sarvam):** Tuning must be done systematically. Do not just ask "Does this sound good?". Record observations for:
     - Pronunciation, naturalness, pace, emotion, turn-taking, silence handling, prompt comprehension, accent, and fallback behavior.
     - Use representative scripts rather than ad-hoc testing.

## System Resilience & Observability Standards

**Failure-Path Testing (13.16)**
Per `AGENTS.md`, all external API calls must fail gracefully and not crash the intake pipeline. The next steps require deliberately killing external services (eCourts, Bolna, LLM, Supabase, Pushbullet, DSP) one at a time to verify:
`external failure` → `bounded timeout` → `logged/redacted error` → `safe fallback` → `intake continues where possible`.
- **CRITICAL:** No stack trace containing PII should ever reach `stdout`.

**Production Observability (13.17)**
The system must be updated to thread correlation IDs across the complete lifecycle to trace incidents without logging sensitive content. The IDs that need to be correlated are:
- `request_id`
- `victim_id`
- `case_id`
- `session_id`
- `call_id`
- `webhook_event_id`
- `scoring_id`
- `task_id`

This ensures a single incident can be traced (`CALL-123` → `CASE-456` → `SCORE-789` → `TASK-012`) completely safely.

## Core Rules (`AGENTS.md`)
- Python backend must be strictly typed and async.
- No PII logged to stdout; must pass through redaction before returning to non-district-tier users.
- Every scoring computation MUST return a component breakdown for XAI compliance.
- All external API calls must fail gracefully and not crash the intake pipeline.
