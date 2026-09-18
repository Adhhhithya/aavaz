/**
 * Milestone types this slice validates against — directly evidenced by
 * v0.2 Workflow B "B5": "Investigation milestones that have no reliable
 * public feed (chargesheet filed, relief instalment paid) are entered by
 * the case manager. Entering the FIR date starts configurable milestone
 * timers..." Three concrete, named events: the FIR date, a chargesheet
 * being filed, and a relief instalment being paid. No other milestone
 * type is named anywhere else in the spec text (confirmed by search), so
 * no other value is accepted — this is a closed set, not an open
 * free-text field, matching every other domain's own "validated, not
 * free text" discipline.
 *
 * `chargesheet_filed` is also directly load-bearing for a REAL legal
 * issue this repository's spec names elsewhere (Workflow E's
 * `INVESTIGATION_DELAY` issue: "No chargesheet past configured window" —
 * PoA Rules r.7; BNSS s.193) — capturing this date now gives a future
 * legal-issue-detection slice (analysis-svc, Python, not built yet) real
 * data to compute that window from, rather than nothing.
 */
export const MILESTONE_TYPES = ['fir_filed', 'chargesheet_filed', 'relief_instalment_paid'] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export function isMilestoneType(value: string): value is MilestoneType {
  return (MILESTONE_TYPES as readonly string[]).includes(value);
}
