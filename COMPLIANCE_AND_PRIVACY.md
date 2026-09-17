# Compliance and Privacy Documentation

This document outlines the privacy guidelines, legal compliance measures, and data handling protocols built into the Mental Health Monitoring system, particularly concerning the handling of Sensitive Personal Data (SPD) under Indian data protection laws.

## 1. Digital Personal Data Protection (DPDP) Act, 2023 Alignment

The system aligns with the core tenets of the DPDP Act, 2023:

### 1.1 Notice and Consent (Section 5 & 6)
- **Notice:** Before any personal data is processed, the Mobile App (`ConsentScreen.js`) presents a clear, itemized notice in the user's preferred language (Hindi, Tamil, Malayalam, or English). It explains what data is collected (GPS, acoustic/voice samples, chat transcripts) and the purpose (continuous psychological monitoring and emergency response).
- **Explicit Consent:** A mandatory, affirmative action (toggle switch) is required. The system **does not** proceed with registration unless `consent_given = true`.
- **Withdrawal of Consent:** Users have the right to withdraw consent or opt-out of specific channels (e.g., "Do NOT contact me via SMS or Phone Calls" toggle). The system ceases automated outbound check-ins immediately upon withdrawal.

### 1.2 Data Minimization & Purpose Limitation (Section 8)
- Data collected is strictly limited to what is necessary for distress scoring and emergency dispatch.
- **Location Data:** GPS location is only actively polled during an explicit SOS trigger or at the moment of registration. It is not continuously tracked in the background.

## 2. Tiered PII Redaction Strategy

To prevent unauthorized exposure of Personally Identifiable Information (PII) such as Names, Phone Numbers, and exact GPS coordinates, the system employs a strict, role-based redaction policy enforced at the frontend view layer and backend API payload layer.

### 2.1 Role-Based Visibility
| Role | Access Level | Data Displayed |
|---|---|---|
| **Counsellor** | Full Access (Assigned Cases Only) | Raw Transcripts, Full Name, Phone Number, Audio playback. |
| **District Officer** | Restricted Access (District Scope) | `case_id` only on main tables (e.g., `ManagementView.jsx`). Names and Phones are scrubbed from the `SOSMap.jsx` default view. Full PII is only revealed upon deliberate click ("View Full Case") and is heavily access-logged. |
| **State Officer** | Aggregate View Only | No raw PII. Only District names, total counts, and aggregate SLA times are visible. |
| **National Admin** | Aggregate View Only | No raw PII. State-level comparisons and anonymized scatter plots only. |

### 2.2 Frontend Redaction Enforcement
As part of the structural PII audit, the District Dashboard has been explicitly hardened:
- In `ManagementView.jsx`, the queue table relies on `case_id` (e.g., `case-567`) instead of user names to prevent shoulder-surfing.
- In `SOSMap.jsx`, map pins and popups do not expose names or phone numbers, displaying only the escalation state and time elapsed.

## 3. Data Retention and Archival Policy

In accordance with legal requirements for medical and legal records, the system enforces the following retention schedules:

1. **Active Cases:** All interaction data, acoustic samples, and distress scores are retained in hot storage (Supabase) while the `case_stage` is anything prior to `closed`.
2. **Closed Cases (Short-term):** Once marked `closed`, raw audio blobs and unredacted chat transcripts are permanently purged after **90 days** (allowing a buffer for appeals or immediate re-opening).
3. **Archival (Long-term):** After 90 days, the case record is anonymized. The `users` table record is scrubbed of `phone_number` and `name`. The remaining metadata (Case Type, District, Stage History, Distress Trend Array) is retained indefinitely in cold storage for National/State policy analytics.

## 4. Third-Party Integration Disclosures

The MVP architecture simulates connections to external government databases. In a production environment, the following DPDP-compliant data sharing agreements must be established:

- **CCTNS / eCourts:** Simulated in MVP. Production integration requires formal MoSJE/MHA API whitelisting. Data ingested from these systems (FIR status, hearing dates) is treated as Sensitive Legal Data.
- **Bolna (IVR) / Sarvam (STT):** Audio streams are passed to these third parties for transcription. Vendor agreements must stipulate that audio data is processed ephemerally in memory and not retained for model training.
- **Pushbullet (SMS):** SMS contents pass through carrier networks. Highly sensitive psychological details are never sent via SMS; SMS is restricted to generic check-in nudges and scheduling links.
