/**
 * The 11 v0.2 lifecycle states (§3 "Case lifecycle") and their transition
 * matrix. This is Node's own `Case.lifecycleState` — a NEW, additive
 * column, NOT the existing `case_stage_enum` — see
 * backend/migrations/0006_lifecycle.sql's header for why the two are
 * deliberately different columns for different concepts.
 *
 * TRANSITION MATRIX RECONSTRUCTION METHODOLOGY (read before editing this
 * file): v0.2's lifecycle diagram (§3) is a flowchart image whose text was
 * extracted from the PDF as a flat, position-tagged list of node and edge
 * labels (no explicit arrow/endpoint data survives PDF text extraction).
 * The matrix below was reconstructed by reading each label's X/Y
 * coordinate on the page and inferring which node each edge label sits
 * between — this is a good-faith, documented reconstruction, not a
 * verbatim transcription of an unambiguous source. Every edge below is
 * traceable to a specific extracted label; every deliberately-omitted edge
 * is called out explicitly rather than silently assumed. Per this
 * milestone's explicit instruction, no transition not supported by the
 * spec text or an existing, verified repository behavior was invented.
 *
 * Confirmed node positions and adjacent edge labels (page 3-4 of the PDF,
 * coordinates in points from the top-left):
 *   PENDING_CONSENT (y≈733) --"consent granted" (y≈762)--> REGISTERED (y≈791)
 *   REGISTERED --"case identifier verified" (y≈34, right branch)--> VERIFIED (y≈65)
 *   REGISTERED --"verification pending, monitoring allowed" (y≈59-71, left branch)--> MONITORING (y≈112)
 *   VERIFIED --> MONITORING (the natural continuation once identifiers are
 *     confirmed; v0.2 A4's own text — "Registration continues if neither
 *     is available" — confirms MONITORING does not strictly require
 *     VERIFIED first, so VERIFIED is an optional waypoint, not a required
 *     gate)
 *   MONITORING --"level Bad or worse" (y≈141)--> ESCALATED (y≈170)
 *   MONITORING --"victim pauses" (y≈133)--> PAUSED (y≈170)
 *   PAUSED --"victim resumes" (y≈141)--> MONITORING
 *   ESCALATED --"referral sent" (y≈199)--> REFERRED (y≈228)
 *   REFERRED --"resolved by case manager" (y≈141) / "service verified"
 *     (y≈170)--> MONITORING (two alternative real-world triggers for the
 *     same return edge — v0.2 Workflow H's own "Yes moves the ticket to
 *     DELIVERED or VERIFIED" describes the same underlying event)
 *   {MONITORING, ESCALATED, REFERRED, PAUSED} --"case disposed" (y≈170)--> CLOSING
 *     (case disposal is an external court-sync event, independent of the
 *     current support-workflow state — v0.2 Workflow I: "case.disposed
 *     moves the victim to CLOSING")
 *   {MONITORING, ESCALATED, REFERRED, PAUSED} --"victim opts out"
 *     (y≈199)--> OPTED_OUT (v0.2's own rules text: "OPTED_OUT stops all
 *     outbound contact immediately" — read as available from any state
 *     where outbound contact could currently be happening)
 *   CLOSING --"final check-ins done" (y≈256)--> CLOSED
 *   CLOSED --"retention expiry" (y≈314)--> PURGED
 *   OPTED_OUT --"deletion job" (y≈314)--> PURGED
 *
 * DELIBERATELY NOT INCLUDED, and why (ambiguity documented rather than
 * guessed):
 *   - PENDING_CONSENT/REGISTERED/VERIFIED -> OPTED_OUT or -> PAUSED: no
 *     edge label positions support a pre-monitoring opt-out or pause in
 *     the extracted diagram. A victim wanting to stop contact before
 *     monitoring begins is a real possible need, but inventing this edge
 *     without textual support would violate this milestone's explicit
 *     instruction. FastAPI's legacy, unvalidated endpoint remains the
 *     escape hatch for this specific case until it is explicitly decided.
 *   - ESCALATED/REFERRED -> PAUSED directly: only "MONITORING -> PAUSED"
 *     has clear positional support (the "victim pauses" label sits
 *     directly between the MONITORING and PAUSED nodes). Whether a victim
 *     mid-escalation can also pause is plausible but not evidenced here.
 *   - Any transition OUT of CLOSED or PURGED: no outgoing edges are drawn
 *     from either in the extracted diagram; both are treated as fully
 *     terminal.
 *   - Any transition OUT of OPTED_OUT other than -> PURGED: none shown.
 *
 * Self-transitions (source === target) are rejected by this module as an
 * application-level safety default (not a v0.2 requirement) — a
 * "transition" to the state a case is already in is not a real state
 * change and is refused rather than silently accepted or silently
 * ignored.
 */

export const LIFECYCLE_STATES = [
  'PENDING_CONSENT',
  'REGISTERED',
  'VERIFIED',
  'MONITORING',
  'ESCALATED',
  'REFERRED',
  'PAUSED',
  'CLOSING',
  'CLOSED',
  'OPTED_OUT',
  'PURGED',
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function isLifecycleState(value: string): value is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(value);
}

const ACTIVE_CONTACT_STATES: readonly LifecycleState[] = ['MONITORING', 'ESCALATED', 'REFERRED', 'PAUSED'];

/** Explicit transition matrix — every key is a source state, every value
 * the set of target states reachable directly from it. An empty array
 * means the state is terminal (no outgoing transition is permitted at
 * all). This is intentionally NOT "any string in the enum is valid" —
 * see this file's header. */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  PENDING_CONSENT: ['REGISTERED'],
  REGISTERED: ['VERIFIED', 'MONITORING'],
  VERIFIED: ['MONITORING'],
  MONITORING: ['ESCALATED', 'PAUSED', 'CLOSING', 'OPTED_OUT'],
  ESCALATED: ['REFERRED', 'CLOSING', 'OPTED_OUT'],
  REFERRED: ['MONITORING', 'CLOSING', 'OPTED_OUT'],
  PAUSED: ['MONITORING', 'CLOSING', 'OPTED_OUT'],
  CLOSING: ['CLOSED'],
  CLOSED: ['PURGED'],
  OPTED_OUT: ['PURGED'],
  PURGED: [],
};

export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  if (from === to) return false;
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/** Whether a lifecycle state represents one where outbound contact could
 * currently be happening — matches v0.2's own rules text ("only
 * MONITORING, ESCALATED, REFERRED and CLOSING may receive outbound
 * check-ins. PAUSED stops scheduled outreach but keeps victim-initiated
 * contact"). Not used to gate anything in this slice (no scheduling
 * exists yet, per S8's explicit OUT-of-scope list) — exported for a
 * future scheduling slice to reuse rather than reconstruct independently. */
export const ACTIVE_OR_PAUSED_STATES: readonly LifecycleState[] = ACTIVE_CONTACT_STATES;
