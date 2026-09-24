# Phase 0: Deep Repository Reconnaissance

## 1. Actual Architecture Map

The AAVAZ prototype consists of four main distinct execution environments backed by a unified datastore:

1.  **Backend (`/backend`)**: A FastAPI service handling identity, intake webhooks, distress scoring, and dashboard APIs.
2.  **Frontend (`/frontend`)**: A React/Vite web application providing dashboards for Counsellors, District Admins, State Admins, and National Admins.
3.  **Mobile App (`/mobile`)**: A React Native (Expo) application serving as the primary touchpoint for victims (registration, grievances, SOS, check-ins).
4.  **Voice Agent (`/voice-agent`)**: A standalone Python CLI application performing real-time voice streaming using local STT/TTS models and OpenRouter for LLM reasoning.
5.  **Datastore**: Supabase (PostgreSQL) handling all persistent storage (`users`, `cases`, `interactions`, `staff`, etc.) with RLS (Row Level Security).

## 2. Major Data Flows

1.  **Victim Registration & Authentication**: Victims register via the mobile app. OTPs are requested and validated (mostly hardcoded to `123456` in development/testing via `otp_providers.py`).
2.  **SOS Trigger**: Victim hits SOS in the mobile app `app_routes.py/sos` -> updates case to high priority -> records a hardcoded `0.95` interaction score -> triggers a push notification.
3.  **App Check-ins**: Victim logs a mood -> `app_routes.py/checkin` -> records a hardcoded `0.5` neutral/fear interaction score.
4.  **Voice Webhook Intake**: External provider (Bolna) sends call payloads to `ivr_webhook.py` -> payload verified -> passed to `calculate_dynamic_score` -> interaction and case updated.
5.  **SMS Intake**: Pushbullet WebSocket listener (`run_sms_listener.py`) captures incoming SMS, passes it through LLM extraction, and replies back via Pushbullet.
6.  **Distress Scoring**: Multi-modal fusion (`fusion.py`) merging Acoustic, Sentiment, and Engagement signals. Fallbacks safely redistribute weights if a signal fails.
7.  **Dashboard Consumption**: Staff log into the React frontend. Dashboards consume `/api/v1/dashboards/*`.

## 3. Discrepancies Between Documentation and Code

-   **Missing Mock Endpoints**: `SYSTEM_SPEC.md` references `simulated_nhaa_fir.py` for mocked intake endpoints. This file does not exist in the repository.
-   **eCourts Integration**: Documentation claims a simulated eCourts integration for proactive case staging, but this is absent from the backend routing logic (it was likely removed or never fully implemented).
-   **Dashboard Data**: `S8_DEPENDENCY_AUDIT.md` correctly identifies that state and national dashboards in the React frontend utilize completely fabricated arrays instead of bridging to the backend properly.

## 4. Known Gaps, Hardcoded Logic & Intentional Limitations

During the systematic search for technical debt (`TODO`, `mock`, `fake`, `dummy`, `console.log`), the following severe limitations were identified:

### Backend
-   **App Routes (`app_routes.py`)**: Submitting an SOS, checking in, or submitting a grievance completely bypasses the `fusion.py` distress scoring engine. They directly insert `interactions` with completely hardcoded scores (e.g., `0.95` for SOS, `0.8` for grievances).
-   **Dashboards (`state_routes.py`, `district_routes.py`)**: These routes contain mock aggregations and heavily hardcoded logic that fabricates statistics rather than performing deep aggregation on the actual `cases` table.
-   **Embeddings (`embedding_service.py`)**: Bypasses real NLP sentence-transformers in test/CI or when unconfigured, using a `MockEmbeddingProvider` that returns deterministic, static arrays.
-   **Location Resolution (`location_resolver.py`)**: Bypasses real Geocoding, hardcoded to return `"Mock District", "Mock State"`.
-   **Translation & PII (`translation.py`, `pii_redaction.py`)**: Feature basic MVP mock replacements that skip actual ML redaction for speed in demo environments.
-   **OTP Verification (`otp_providers.py`)**: Relies heavily on development logging and a dummy `123456` OTP code instead of actually dispatching messages in local environments.
-   **SMS Listener (`run_sms_listener.py`)**: Flooded with `print()` statements and acts as a background script rather than a robust production worker queue.

### Frontend & Mobile
-   **Mobile Notifications (`notifications.js`)**: Push notifications are fully mocked (`console.log('Mock: Registering for push notifications')`) and will fail silently on physical devices without proper setup.
-   **Frontend Admin UI (`NationalDashboard.jsx`, `StateDashboard.jsx`)**: Hardcodes arrays like `const mockStates = [...]` and `const mockDistricts = [...]` for rendering the UI, bypassing the API entirely.

## 5. Security & Reliability Observations

-   **Swallowed/Generic Exceptions**: Broad `except Exception as e:` blocks exist across the backend (`app_routes.py`), often returning generic 500 errors to the client while logging internally.
-   **Environment Variables**: `run_production_gate.py` injects `mock_key_for_test_environment` into `os.environ`. Test suites use `fake_supabase.py` heavily, meaning there is a risk that test data patterns deviate from the actual remote Supabase schema if migrations drift.
-   **Test Coverage**: While tests cover math (`test_fusion_math.py`), ID verification, and webhooks thoroughly, they intentionally skip end-to-end integration for the heavily mocked admin dashboards and mobile app routes.

---
**Reconnaissance Complete.** The repository contains a functionally sound IVR/Scoring pipeline, but is surrounded by an MVP outer-shell of hardcoded UI data, mock location/embedding resolvers, and fake app-route scoring logic.
