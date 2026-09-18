import { IsIn } from 'class-validator';
import { LIFECYCLE_STATES, LifecycleState } from '../lifecycle-states';

/**
 * Deliberately has ONLY a target state — no `currentState`/`fromState`
 * field exists. Per this milestone's explicit security instruction, the
 * client may never claim "current_state = X"; the server always reads the
 * real current state itself (see LifecycleService.transition) and the
 * transition matrix is checked against that server-read value, never a
 * client-supplied one.
 *
 * No `reason` field exists in this slice either — a deliberate,
 * conservative choice: `staff_audit_log.reason` is reserved for a future
 * break-glass flow (S7's own documentation), and accepting free-text
 * "reason" input here risks a well-meaning staff member typing victim
 * narrative into a field this milestone promises will never contain it.
 * See docs/S8_LIFECYCLE_MIGRATION.md.
 */
export class TransitionLifecycleDto {
  @IsIn(LIFECYCLE_STATES)
  targetState!: LifecycleState;
}
