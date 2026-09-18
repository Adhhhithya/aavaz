-- 0013_referral_ack_token.sql
-- S16 (Referral one-time acknowledgement link) — adds one nullable
-- column to the existing `referrals` table (S9), per v0.2 §14's public
-- API table: "POST /v1/ack/{token}, Referral receiver, One-time
-- acknowledgement link" and Workflow H's own text: "Receivers
-- acknowledge via a one-time link (no login, shows nothing but an
-- Acknowledge button and reference number)."
--
-- ADDITIVE ONLY: one nullable column on one existing table.
--
-- `ack_token_hash` stores ONLY a SHA-256 hash of a 256-bit random token —
-- never the raw token itself, the same "never store a secret in
-- plaintext" discipline `otp_codes.code_hash` already established (S2/S4).
-- Unlike OTP codes (a short 6-digit value that NEEDS a server-side pepper
-- to resist brute force, since its own input space is only 10^6), this
-- token has 256 bits of entropy — a plain, unsalted SHA-256 hash of a
-- secret that large is not meaningfully improved by an additional pepper,
-- so none is used here (a deliberate, documented difference, not an
-- oversight — see apps/core-api/src/referral/referral-ack.ts).
--
-- No separate "consumed" flag is added: single-use is enforced by the
-- SAME conditional-UPDATE pattern (`WHERE status = 'SENT'`) every other
-- transition in this codebase already uses — once a referral leaves SENT
-- (whether via this token or a staff action), the token's own claim
-- attempt can no longer match, with no separate bookkeeping needed. A
-- new token is generated every time a referral (re-)enters SENT
-- (including a bounce-then-retry), which naturally invalidates any
-- earlier, still-circulating link.

ALTER TABLE referrals
    ADD COLUMN IF NOT EXISTS ack_token_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_referrals_ack_token_hash ON referrals(ack_token_hash);
