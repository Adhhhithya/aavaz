# PHASE 2: SECURITY, DATA INTEGRITY & CORE BACKEND HARDENING

This document outlines the systematic security, authorization, data integrity, and backend reliability audit and implementation pass performed on the AAVAZ repository during Phase 2.

## 1. Data Integrity & Schema Consistency
A critical audit of the Supabase PostgreSQL database schemas (`unified_full_schema.sql`) against the Python API payloads (`GrievanceRegistrationPayload`) revealed silent data corruption risks: the API was attempting to update several missing columns.

### Fixes Implemented:
- **`018_phase2_data_integrity.sql`**: Added missing columns to `users` (`first_name`, `middle_name`, `last_name`, `father_name`, `dob`, `category`, `nationality`, `aadhaar_number`, `address_pincode`, `address_taluka`, `address_full`).
- **Missing `cases` columns**: Added `grievance_related_to`, `has_fir`, `submitter_role`, `cnr_number`, `cnr`, `grievance_description`, `ecourts_data` to ensure all fields submitted via the mobile/web UI are safely persisted without Postgres `column does not exist` exceptions.

## 2. Core Backend Reliability & Scoring Integrity
The distress scoring mechanism is the core feature of the dynamic monitoring system. During the audit, it was discovered that multiple intake routes were bypassing the `calculate_dynamic_score` ML fusion pipeline, injecting hardcoded dummy scores instead. This completely corrupted case prioritization.

### Fixes Implemented:
- **App Routes (`/cases`, `/grievance`)**: Removed hardcoded `0.8` and `0.75` initial distress scores. Integrated the `api.scoring.fusion` pipeline so that the initial grievance transcript generates an accurate, AI-backed baseline distress score immediately upon registration.
- **SMS Intake (`sms_intake_service.py`)**: The inbound SMS webhook was logging a hardcoded `0.0` distress score, masking severe crisis signals if the victim reached out via SMS. It now parses the raw inbound SMS through `calculate_dynamic_score`.
- **Background Worker Race Conditions**: In `api.assignment.escalation.py`, `check_and_escalate_sos` was performing un-isolated read-modify-write loops. Implemented Optimistic Locking (`.eq("escalated", False)`) in the update query to guarantee safe concurrent execution across multiple worker nodes without triggering duplicate escalations.
- **SOS Idempotency**: Added `Unique Violation (23505)` handlers and constraints to prevent users from spamming the panic button and generating duplicate concurrent tasks. Verified by asynchronous testing (`test_architecture_idempotency.py`).

## 3. Webhook Authentication (Security)
- **Bypass Removed**: The Bolna IVR and Pushbullet SMS webhooks previously relied on an `_is_dev()` bypass that permitted unauthenticated execution in development. This violated the directive that "production paths must never rely on development-only bypasses". The bypass was removed; webhooks now strictly enforce constant-time `hmac.compare_digest` validation against genuine secrets in all environments.

## 4. Frontend Route Protection
- **SuperAdmin Guard**: The `App.jsx` React frontend contained an exposed SuperAdmin dashboard that bypassed the standard `<ProtectedRoute>` wrapper. It is now securely wrapped with explicit role checks (`['super_admin']`).

## 5. API Security & CORS
- **Restricted Origins**: The FastAPI application was overly permissive (`allow_origins=["*"]`). It was restricted to explicitly match the configured frontend domains to prevent Cross-Site Request Forgery (CSRF) and cross-origin abuse.

## 6. Row Level Security (RLS) Authorization
- **Role Isolation**: Hardened Supabase RLS policies via `017_harden_rls_and_idempotency.sql`. Policies now rely on strict joins against the `staff` table rather than unsafely trusting arbitrary `auth.jwt()` role claims for case visibility. District, State, and National administrators are strictly isolated to their scopes.

---
**Status:** All Phase 2 security and data integrity directives have been addressed. 150+ Integration Tests pass successfully.
