# AAVAZ Hardcoded Value Audit

**Date:** 2026-09-20
**Phase:** 12 (Production Hardening)

## Scope
An exhaustive repository-wide search was conducted for the following patterns: `mock`, `dummy`, `test`, `placeholder`, `Math.random`, `localhost`, `TODO`, and `FIXME`.

## Findings & Resolutions

### Classification Legend
*   **A - Legitimate constant:** (e.g., policy thresholds)
*   **B - Environment configuration fallback:** (e.g., `localhost` defaults)
*   **C - Mocked runtime data:** (e.g., fake metrics)
*   **D - Test fixture:** (e.g., `tests/`)
*   **E - Unfinished placeholder logic:** (e.g., `// TODO: connect DB`)
*   **F - Explicitly Approved Mock:** (e.g., `ngrok` URL)

---

### Mobile App (`/mobile`)

| File | Entity | Class | Resolution |
|------|--------|-------|------------|
| `api.js` | `'http://localhost:8000'` | B | Removed fallback. Enforced `config.apiUrl` dependency. |
| `RegisterScreen.jsx` | `location: {lat, lng}` mock | E | Removed fake coordinates. Pass actual location or omit. |

### Frontend (`/frontend`)

| File | Entity | Class | Resolution |
|------|--------|-------|------------|
| `vite.config.js` | `target: 'http://localhost:8000'` | B | Removed fallback. Enforced `VITE_API_URL` usage. |
| `NationalDashboard.jsx`| `mockStates` array | E | Removed fake array. Mapped directly to API `state_breakdown`. |
| `NationalDashboard.jsx`| `Math.random()` | C | Removed fake animations and metrics. Replaced with actual values. |
| `StateDashboard.jsx` | `mockDistricts` array | E | Removed fake array. Mapped directly to API `district_breakdown`. |

### Backend (`/backend`)

| File | Entity | Class | Resolution |
|------|--------|-------|------------|
| `app_routes.py` | `11111111...` ID mock | E | Replaced with dynamic `assign_counsellor()` auto-routing. |
| `app_routes.py` | `current_distress_score: 90` | A | Retained. SOS implies critical policy risk. |
| `sos_routes.py` | `# 30-min escalation (mock)` | E | Implemented real `tasks` table insert for SOS escalations. |
| `location_resolver.py` | `"Mock District"` | E | Removed. Falling back to `"Unknown"` to avoid DB pollution. |
| `national_routes.py` | `"avg_sla": "24h"` | E | Removed fake SLA and resource metrics entirely. |
| `state_routes.py` | `stats = { "total_cases": 1250 }` | E | Replaced with dynamic Supabase aggregation query scoped to user state. |
| `district_routes.py` | `table("sos_events")` mock | E | Replaced with active relational filtering (users -> cases -> sos). |
| `ivr_webhook.py` | `*.ngrok-free.dev` | F | **Retained (Explicit Exception Approved)**. |
| `tests/*` | Fake Providers & DBs | D | **Retained**. Test fixtures properly isolated. |

## Conclusion
All mock UI arrays, static placeholder values, fallback development endpoints, and dummy ID injections have been systematically purged from the repository. The application logic is now fully bound to its dynamic backend state and configuration pipelines.
