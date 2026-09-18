/**
 * The task domain's own state machine (v0.2 §12's data model names
 * `sla_due_at`, `acked_at`, `completed_at`, `status` as separate columns
 * on `tasks` — no explicit state-diagram page exists for tasks the way
 * Workflows G (referral) and the lifecycle diagram do, so this matrix is
 * inferred directly from those THREE timestamp columns' own names, not
 * from a diagram): a task starts OPEN (neither timestamp set), moves to
 * ACKNOWLEDGED when `acked_at` is stamped, then COMPLETED when
 * `completed_at` is stamped — plus a CANCELLED terminal state for a task
 * that turns out not to be needed (e.g. the referral it was about got
 * resolved another way), which v0.2's text doesn't name explicitly but is
 * a necessary escape hatch any real task-tracking system needs — flagged
 * here as an application-level addition, not a spec-evidenced one, same
 * discipline as lifecycle-states.ts's own self-transition-rejection
 * default.
 */

export const TASK_STATES = ['OPEN', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export function isTaskState(value: string): value is TaskState {
  return (TASK_STATES as readonly string[]).includes(value);
}

export const TASK_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  OPEN: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidTaskTransition(from: TaskState, to: TaskState): boolean {
  if (from === to) return false;
  return TASK_TRANSITIONS[from].includes(to);
}

/**
 * Task types this slice actually creates. Both are directly evidenced by
 * v0.2's text (not invented):
 *   - `referral_stalled`: Workflow H "H3" — "Stalled ticket: case manager
 *     follow-up, then supervisor after 5 working days..." Created
 *     AUTOMATICALLY by apps/core-api/src/referral/referral.service.ts
 *     whenever a referral transitions to STALLED (a real trigger this
 *     repository already has, unlike the check-in-based triggers below).
 *   - `referral_review`: Workflow H "H2" — "Not helpful creates a case
 *     manager review task." v0.2 describes this as created from a
 *     post_referral check-in's "not helpful" answer — infrastructure this
 *     repository does not have (no scheduling/check-in system exists,
 *     S8 audit §F/I). Created MANUALLY by staff in this slice as the
 *     stopgap for that missing trigger, the same "manual now, automatic
 *     once the infrastructure exists" pattern every prior slice's own
 *     deferred-automation items use.
 *
 *   - `unassigned_case`: Workflow A "A7" — "No match creates an
 *     unassigned task for the district supervisor." Added in S14, wired
 *     from apps/core-api/src/identity/registration.service.ts's own
 *     transaction whenever a district was resolved but
 *     AssignmentService.assign() found no eligible counsellor (the exact
 *     "no match" case A7 describes — a case with no district at all is
 *     deliberately NOT given this task, since no district supervisor's
 *     queue could ever show it; see docs/S14_TASK_TRIGGER_EXTENSION.md).
 *
 * Other task-shaped mentions found in v0.2's text (`court_sync_stale`,
 * Workflow B "B4"; `silence`, the silence-ladder code sample) are real,
 * evidenced, but NOT wired to an automatic trigger yet — see
 * docs/S12_TASK_MIGRATION.md section C for why: both need infrastructure
 * (automated court-sync polling, a job queue) this repository still does
 * not have, unlike `unassigned_case`, whose trigger condition S5's own
 * `RegistrationService` already detects and logs today.
 */
export const TASK_TYPES = ['referral_stalled', 'referral_review', 'unassigned_case'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}

/**
 * Reuses v0.2's own triage-level vocabulary (Workflow F's Good/Okay/Bad/
 * Serious/Critical table) rather than inventing a separate task-priority
 * scale — directly evidenced by the silence-ladder code sample (PDF page
 * 17): `const priority = last.level >= 2 || last.openThreat ? 'serious' :
 * 'okay'; await acts.createTask(victimId, { type: 'silence', priority
 * });`. `good` is excluded — no evidenced flow ever creates a task at
 * "Good" (Workflow F's own table: "Good: Keep victim's interval, None" —
 * no task action at all).
 */
export const TASK_PRIORITIES = ['okay', 'bad', 'serious', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}
