# Phase 2: Security Hardening & Audit Report

## 1. Scope of Audit
This audit and subsequent implementation pass targeted authentication bypasses, webhook signature verification, frontend authorization boundaries, cross-origin resource sharing (CORS), and OTP delivery mechanisms across the AAVAZ system.

## 2. Identified Vulnerabilities & Fixes

### 2.1 Insecure Webhook Authentication Bypass (High Severity)
- **Vulnerability**: In `backend/api/auth/webhook_auth.py`, the `verify_bolna_webhook` function contained an `_is_dev()` bypass that would accept ANY request possessing an `X-Bolna-Signature` header, completely skipping secret validation in development environments. This violated the invariant that production paths must not rely on development-only bypasses, as environments misconfigured as `development` would fail open.
- **Fix**: Removed the `_is_dev()` bypass. `BOLNA_WEBHOOK_SECRET` and `PUSHBULLET_WEBHOOK_SECRET` are now strictly required and enforced via constant-time HMAC comparison (`hmac.compare_digest`) in ALL environments. If unconfigured, the webhook fails closed with a 503.

### 2.2 Unprotected Frontend Routes (High Severity)
- **Vulnerability**: In `frontend/src/App.jsx`, the SuperAdmin routes (`/rit` and `/admin/superadmin`) were explicitly left unprotected (`Unrestricted for test data`), allowing any unauthenticated or unauthorized user to access the highest-level administrative interface.
- **Fix**: Wrapped the SuperAdmin routes in the `<ProtectedRoute allowedRoles={['super_admin']}>` boundary, ensuring the user possesses a valid session and the correct role before rendering the dashboard.

### 2.3 Overly Permissive CORS (Medium Severity)
- **Vulnerability**: In `backend/main.py`, the `CORSMiddleware` was configured with `allow_origins=["*"]` and `allow_methods=["*"]`. This permitted any malicious site to perform cross-origin requests to the API.
- **Fix**: Restricted `allow_origins` to `settings.FRONTEND_URL`, falling back to explicit safe local origins (`http://localhost:5173`, `http://localhost:8081`). Restricted `allow_methods` to standard safe methods.

### 2.4 Idempotency & Race Conditions (Medium Severity)
- **Vulnerability**: As uncovered in Phase 1, multiple API endpoints (e.g., `/sos`, `/checkin`) lacked idempotency. An attacker or a panicking user rapidly firing the SOS button could trigger duplicate tasks, multiple case score inflations, and race conditions in the database.
- **Fix**: Completed the Phase 1 implementation by adding strict UNIQUE database indexes on `sos_events(case_id)` and `tasks(case_id, type)` for open tasks. Updated `app_routes.py` and `sos_routes.py` to gracefully catch Postgres `23505` (Unique Violation) errors and ignore duplicate inbound requests. 

### 2.5 OTP & Token Safety (Low Severity / Acknowledged Risk)
- **Observation**: `otp_providers.py` gracefully degrades to logging the OTP in the console when `PUSHBULLET_API_KEY` is not present. This is heavily flagged as `[DEV ONLY]`. The actual token generation and hashing in `otp_service.py` is secure and utilizes salted hashes, mitigating token leakage in database dumps.
- **Action**: Acknowledged. As long as `ENVIRONMENT` is strictly `production` on deployment, the synthetic provider refuses to instantiate.

## 3. Residual Security Assumptions
1. **Supabase JWTs**: The system assumes that Supabase JWTs are signed correctly by the GoTrue service and that the FastApi backend properly verifies the signature (currently relying on Supabase Client RLS to reject invalid tokens at the database level).
2. **Environment Variables**: We assume that `.env` files and deployment secrets are securely injected and not checked into source control (confirmed `.env.example` is used in repos).
3. **Pydantic Validation**: We rely on Pydantic models (e.g. `AppRegistrationRequest`) to prevent Mass Assignment by strictly limiting what fields are accepted from the JSON body.

---
*Audit completed and fixes implemented.*
