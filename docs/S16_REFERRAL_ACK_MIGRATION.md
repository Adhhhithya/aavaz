# S16 — Referral One-Time Acknowledgement Link

Implementation record for S16. Chosen after re-auditing v0.2's §14 public
API surface table against what this codebase has actually built: every
row was covered by an existing domain except one — `POST /v1/ack/{token}`,
named for the "Referral receiver" role ("Their packet and ack link
only"). Workflow H's own text describes it precisely: "Receivers
acknowledge via a one-time link (no login, shows nothing but an
Acknowledge button and reference number) or the case manager logs
acknowledgement after a call." The second half (a staff member manually
transitioning `SENT → ACKNOWLEDGED`) has existed since S9; this slice
builds the first half — the genuine receiver-facing link.

This is the first **unauthenticated write endpoint** in this codebase,
so its security design is documented in full below rather than only
referenced.

## A. Scope

**In scope:**
1. `Referral.ackTokenHash` (additive column) — a SHA-256 hash of a
   256-bit random token, generated fresh every time a referral (re-)enters
   `SENT`.
2. `GET`/`POST /v1/ack/:token` — a dedicated, separate controller
   (`ReferralAckController`) with NO `StaffAuthGuard`, mounted at
   `/v1/ack` rather than under `/v1/console`.
3. The raw token is returned to staff exactly once, in the direct
   response to the `SENT` transition that generated it — never persisted
   in plaintext, never logged, never returned by any other call.
4. Tests: token-generation unit tests, full service-level unit tests for
   both the token-authenticated path (`acknowledgeViaToken`) and the
   read-only info path (`getAckInfo`), and a real-Postgres, real-HTTP
   integration suite including a genuine concurrent-use race.

**Out of scope:**
- Any real delivery mechanism (SMS/email) for actually SENDING the link
  to the receiver — v0.2's own Workflow G "G3" names this as future work
  ("MVP adapters: encrypted PDF by email... Future adapters call agency
  APIs"), and `docs/S9_REFERRAL_MIGRATION.md` already deferred it. Staff
  relay the raw token manually via whatever channel is in use today.
- The receiver-facing landing PAGE itself ("shows nothing but an
  Acknowledge button and reference number") — that is frontend work, out
  of scope for every prior slice's own backend-only boundary. This slice
  provides the two API calls (`GET` for display data, `POST` for the
  action) such a page would call.
- Rate limiting on the public endpoint — see Section C for why a 256-bit
  token makes this a materially different risk than OTP's own 6-digit
  code (which DOES have rate limiting, S2/S4), and why its absence here
  is a documented, accepted gap rather than a silent omission.

## B. Why this needed no schema for a separate "consumed" flag

Single-use is enforced entirely by the SAME conditional-`UPDATE` claim
pattern (`WHERE status = 'SENT'`) every other transition in this codebase
already uses (S5/S8/S9/S11/S12/S13/S15) — once a referral leaves `SENT`
(via this token OR a staff action), any later claim attempt against the
same token can no longer match `status = 'SENT'`, with zero additional
bookkeeping. A new token is generated on every fresh entry into `SENT`
(including a bounce-then-retry), which naturally invalidates any earlier,
still-circulating link rather than leaving it valid forever — proven by
test (`referral.service.spec.ts`'s "a later SENT... issues a NEW token
that invalidates the old one").

## C. Security design (read this before touching this file)

- **Token entropy over rate limiting**: `otp_codes` (S2/S4) needs a
  server-side pepper AND rate limiting because a 6-digit code's own input
  space (10^6) is trivially brute-forceable otherwise. This token is
  `crypto.randomBytes(32)` — 256 bits, base64url-encoded — a search space
  so large that online brute-forcing is computationally infeasible
  regardless of rate limiting. A plain (unpeppered) SHA-256 hash of the
  raw token is stored, matching how industry-standard password-reset/
  magic-link tokens are typically implemented. Documented here as a
  DELIBERATE difference from the OTP pattern, not an inconsistency a
  future reader should "fix" by adding a pepper.
- **Consistent denial, no information leakage**: every failure mode
  (token never existed, already used, referral moved on some other way,
  lost a concurrency race) returns the IDENTICAL `NotFoundException`
  ("This acknowledgement link is invalid or has already been used.") —
  the same "never distinguish doesn't-exist from denied" discipline
  `docs/S8_LIFECYCLE_MIGRATION.md` first established for this codebase's
  staff-facing endpoints, now applied to a public one.
- **No victim content ever reachable**: `getAckInfo`'s return type has
  exactly one field (`referenceNumber`) — structurally incapable of
  leaking packet data, victim name, or anything else, the same
  data-minimization discipline `docs/S9_REFERRAL_MIGRATION.md`'s packet
  builders already established.
- **No staff-attributed audit row**: there is no staff actor for a public
  action — matching the exact "system actor, no `StaffAuditService` call"
  precedent `TaskService`'s own `...Tx` methods (S12/S14/S15) already
  established. The referral's own `updated_at`/`status` change is itself
  the durable record of what happened and when.
- **Accepted gap, stated plainly**: no rate limiting exists on `/v1/ack/*`
  — mitigated in practice by the token's own entropy (Section C's first
  point), but a future slice adding basic IP-based throttling to this one
  specific public route would still be a reasonable defense-in-depth
  addition, not currently built.

## D. Tests

- **Unit** (`referral-ack.spec.ts` — 5 tests; 9 new tests added to
  `referral.service.spec.ts`'s own S16 describe block): token
  determinism/uniqueness/format, the "new SENT invalidates the old token"
  property, successful acknowledgement (state transition + SLA
  timestamp), same-token-twice rejection, wrong-token rejection with the
  identical error, a staff member manually acknowledging first also
  invalidating the token, `getAckInfo`'s minimal return shape, the
  no-audit-row property, and confirmation that `rawAckToken` never
  appears on `draft()`/`get()` responses.
- **Integration** (7 new tests in `referral.integration-spec.ts`'s own
  S16 describe block, real disposable PostgreSQL, real HTTP via
  supertest, **no `Authorization` header set on any of these requests**):
  migration additivity, `GET`/`POST` both working with zero auth, same-
  token-twice (404), a made-up token (404, both `GET` and `POST`), and —
  the most important test in this suite — two GENUINELY CONCURRENT `POST`
  requests for the identical token, proving exactly one succeeds under
  real Postgres row-locking, not a simulation.
- **Regression**: `referral.integration-spec.ts`, `task.integration-spec.ts`,
  and `oversight.integration-spec.ts` (all three create real `Referral`
  rows via the actual draft endpoint) each needed `0013_referral_ack_token.sql`
  added to their migration lists — the same class of fix S10's and S14's
  own docs already anticipated for any new column on an existing table.
  `registration.integration-spec.ts`/`staff-console.integration-spec.ts`
  did NOT need it (they only need `referrals` to exist for `tasks`'s FK,
  never read/write a referral row themselves — confirmed, not assumed).
  Full S1-S15 regression suite (312 unit tests, 138 integration tests
  before this slice's own new tests) passes. 327 unit tests and 145
  integration tests total after this slice.

## E. Known limitations

- **No real delivery channel** — Section A; staff relay the token
  manually today.
- **No receiver-facing frontend page** — Section A; backend API only.
- **No rate limiting on the public route** — Section C; mitigated by
  token entropy, not eliminated as a residual concern.
