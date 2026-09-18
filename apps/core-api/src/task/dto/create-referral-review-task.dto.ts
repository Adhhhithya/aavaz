import { IsIn } from 'class-validator';
import { TASK_PRIORITIES, TaskPriority } from '../task-states';

/**
 * Staff-initiated creation of a `referral_review` task (v0.2 Workflow H
 * "H2" — the manual stopgap for a check-in-triggered task this repository
 * can't create automatically yet; see task-states.ts's header). No
 * `reason`/free-text field, matching lifecycle/referral's own "IDs and
 * codes only" audit discipline — the referral itself (referenced by
 * `referralId` in the URL) already identifies what needs review.
 */
export class CreateReferralReviewTaskDto {
  @IsIn(TASK_PRIORITIES)
  priority!: TaskPriority;
}
