/**
 * The 12 v0.2 referral-lifecycle states and their transition matrix
 * (Workflow G, docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf pages 17-18).
 *
 * TRANSITION MATRIX RECONSTRUCTION METHODOLOGY (read before editing this
 * file): same technique as apps/core-api/src/lifecycle/lifecycle-states.ts
 * (S8) — the diagram's text was extracted at word/line granularity with
 * `page.get_text('words')`, grouped by (block, line), so each label's X/Y
 * bounding box is known. The diagram spans the page 17/18 boundary. Two
 * independent sources exist for the node LIST (not the edges): the S8
 * dependency audit's prose ("a 9-state lifecycle... DRAFTED ->
 * AWAITING_CONSENT/APPROVED -> SENT -> BOUNCED/DELIVERED -> ACKNOWLEDGED ->
 * IN_SERVICE -> VERIFIED/STALLED -> CLOSED_UNRESOLVED") is a compressed
 * paraphrase, and this master spec's own section 21 lists all 12 states
 * explicitly including DISCARDED. Per this milestone's instruction to
 * treat the actual PDF as authoritative over any summary, the PDF was
 * re-extracted directly for this slice rather than trusting either prior
 * summary — the 12-state list below is a verbatim transcription of the 12
 * node labels found in the diagram, matching the master spec's list
 * exactly, not the audit's compressed 9-item paraphrase.
 *
 * Confirmed node positions (points from top-left; page 17 continues onto
 * page 18 as one diagram):
 *   DRAFTED        (p17, x=123.7-158.5, y=707.7)
 *   APPROVED       (p17, x=218.3-258.6, y=761.3)
 *   AWAITING_CONSENT (p18, x=133.5-209.4, y=28.9)
 *   SENT           (p18, x=325.8-345.6, y=28.9)
 *   DISCARDED      (p18, x=119.6-162.6, y=82.6)
 *   BOUNCED        (p18, x=244.8-281.3, y=82.6)
 *   ACKNOWLEDGED   (p18, x=312.4-375.8, y=82.6)
 *   IN_SERVICE     (p18, x=322.4-365.8, y=124.9)
 *   STALLED        (p18, x=447.4-480.1, y=124.9)
 *   DELIVERED      (p18, x=323.4-364.7, y=167.3)
 *   CLOSED_UNRESOLVED (p18, x=422.0-505.5, y=167.3)
 *   VERIFIED       (p18, x=327.3-360.8, y=220.9)
 *
 * Edge labels and the edges they were assigned to (position + the G1-G5/
 * H1-H4 narrative prose, which is unambiguous English and takes priority
 * over position alone wherever the two could be read multiple ways):
 *   DRAFTED --"case manager approves" (p17, y=734.5, directly between the
 *     two nodes)--> APPROVED
 *   APPROVED --"not needed" (p17, y=788.1, x=57-96)--> SENT. Read as: the
 *     consent-check step is "not needed" because the matching share_*
 *     scope is already granted. This is the more conservative of two
 *     possible readings (the other being "case-manager-approval is not
 *     needed", i.e. a DRAFTED->SENT shortcut) — rejected because
 *     "not needed" sits in the SAME y-band (788) as "scope not granted"
 *     (781.5) and "victim consents" (788), a cluster of three edge labels
 *     that all describe consent-check outcomes, not the earlier
 *     case-manager-approval step (which already has its own, separately
 *     positioned label at y=734.5). G1's own text ("Before SENT, the
 *     matching share_* consent must be granted") directly supports a
 *     consent check gating entry to SENT specifically.
 *   APPROVED --"scope not granted" (p17, y=781.5)--> AWAITING_CONSENT —
 *     directly matches G1: "Otherwise the ticket moves to AWAITING_CONSENT
 *     and the case manager asks the victim."
 *   AWAITING_CONSENT --"victim consents" (p17, y=788.1, x=178-232)--> SENT
 *   AWAITING_CONSENT --"victim declines" (p18, y=55.7, positioned directly
 *     between AWAITING_CONSENT at y=28.9 and DISCARDED at y=82.6)-->
 *     DISCARDED
 *   SENT --"delivery failed" (p18, y=47.4-55.0, between SENT and
 *     BOUNCED)--> BOUNCED
 *   BOUNCED --"retried" (p18, y=51.1-58.7, immediately adjacent to
 *     "delivery failed")--> SENT — G3's idempotency-key text
 *     ("referral_id:attempt") directly supports a retry concept.
 *   SENT --(no label; direct vertical continuation, same x-column,
 *     immediately below)--> ACKNOWLEDGED — the implicit "delivery
 *     succeeded" path.
 *   ACKNOWLEDGED --(same x-column, sequential)--> IN_SERVICE
 *   IN_SERVICE --(same x-column, sequential)--> DELIVERED
 *   DELIVERED --"victim confirms" (p18, y=194.1, positioned directly
 *     between DELIVERED at y=167.3 and VERIFIED at y=220.9)--> VERIFIED —
 *     matches H2: "Yes moves the ticket to DELIVERED or VERIFIED."
 *   SENT --"SLA breached" (read as the acknowledgement-SLA breach: G5's
 *     "Default acknowledgement within 3 working days")--> STALLED
 *   ACKNOWLEDGED --"SLA breached" (read as the service-start-SLA breach:
 *     G5's "...service start within 10")--> STALLED. Both SLA-breach
 *     edges share the single "SLA breached" label (p18, y=82.6,
 *     x=396-445) because G5 defines exactly two SLA checkpoints and no
 *     positional evidence distinguishes which checkpoint the label
 *     belongs to — both are included since both are explicitly named in
 *     the prose, not invented.
 *   STALLED --"re-sent" (half of the p18 y=82.6 x=455-525 label
 *     "re-sent or escalated")--> SENT
 *   STALLED --"escalated" (other half of the same label)-->
 *     CLOSED_UNRESOLVED — H3's escalation-ladder text ("case manager
 *     follow-up, then supervisor... then inclusion in the monthly
 *     district nodal report") supports an eventual unresolved-closure
 *     outcome for a stalled ticket without ever naming a specific
 *     terminal state itself; CLOSED_UNRESOLVED is the only state whose
 *     name matches that outcome.
 *
 * DELIBERATELY NOT INCLUDED, and why (ambiguity documented rather than
 * guessed, per this milestone's explicit instruction):
 *   - DRAFTED -> DISCARDED (a case manager deciding not to send a draft at
 *     all): no edge label supports this. The only evidenced path to
 *     DISCARDED is AWAITING_CONSENT -> DISCARDED ("victim declines"). A
 *     real, plausible need (discarding a bad draft) is left unimplemented
 *     rather than invented — see "Known limitations" in
 *     docs/S9_REFERRAL_MIGRATION.md.
 *   - IN_SERVICE -> STALLED or DELIVERED -> STALLED: no positional or
 *     textual evidence places an SLA checkpoint this late in the flow; G5
 *     names exactly two SLA checkpoints (acknowledgement, service start),
 *     both already modeled above.
 *   - Any transition out of VERIFIED, DISCARDED, or CLOSED_UNRESOLVED: no
 *     outgoing edges are drawn from any of the three in the extracted
 *     diagram; all three are treated as fully terminal, matching the
 *     lifecycle module's same terminal-state convention.
 *
 * Self-transitions (source === target) are rejected as an application-
 * level safety default, matching lifecycle-states.ts.
 */

export const REFERRAL_STATES = [
  'DRAFTED',
  'APPROVED',
  'AWAITING_CONSENT',
  'SENT',
  'BOUNCED',
  'ACKNOWLEDGED',
  'IN_SERVICE',
  'DELIVERED',
  'VERIFIED',
  'STALLED',
  'DISCARDED',
  'CLOSED_UNRESOLVED',
] as const;

export type ReferralState = (typeof REFERRAL_STATES)[number];

export function isReferralState(value: string): value is ReferralState {
  return (REFERRAL_STATES as readonly string[]).includes(value);
}

/** Explicit transition matrix — see this file's header for the full
 * reconstruction trace. An empty array means the state is terminal. */
export const REFERRAL_TRANSITIONS: Readonly<Record<ReferralState, readonly ReferralState[]>> = {
  DRAFTED: ['APPROVED'],
  APPROVED: ['SENT', 'AWAITING_CONSENT'],
  AWAITING_CONSENT: ['SENT', 'DISCARDED'],
  SENT: ['BOUNCED', 'ACKNOWLEDGED', 'STALLED'],
  BOUNCED: ['SENT'],
  ACKNOWLEDGED: ['IN_SERVICE', 'STALLED'],
  IN_SERVICE: ['DELIVERED'],
  DELIVERED: ['VERIFIED'],
  VERIFIED: [],
  STALLED: ['SENT', 'CLOSED_UNRESOLVED'],
  DISCARDED: [],
  CLOSED_UNRESOLVED: [],
};

export function isValidReferralTransition(from: ReferralState, to: ReferralState): boolean {
  if (from === to) return false;
  return REFERRAL_TRANSITIONS[from].includes(to);
}

/** States a client may request as the TARGET of a `draftReferral` call's
 * first transition is never applicable — DRAFTED is only ever the row's
 * initial value, never a requested transition target (there is no state
 * that transitions INTO DRAFTED). Exported so the DTO can reject it
 * explicitly rather than relying solely on the matrix (every real source
 * state's transition list already excludes it, but an explicit guard is
 * clearer than an absence). */
export const NON_TARGETABLE_STATES: readonly ReferralState[] = ['DRAFTED'];

/** Every state whose transition INTO 'SENT' is gated by a real,
 * currently-granted share_* consent (v0.2 Workflow G, "G1"). Every source
 * state that can reach SENT is listed here — not used to skip the check
 * anywhere, just documents that the gate applies uniformly regardless of
 * which edge (initial send, bounce-retry, stalled-resend) is being taken. */
export const CONSENT_GATED_TARGET: ReferralState = 'SENT';
