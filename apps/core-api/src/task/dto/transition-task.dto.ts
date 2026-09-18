import { IsIn } from 'class-validator';
import { TASK_STATES, TaskState } from '../task-states';

/**
 * Deliberately has ONLY a target state — same rationale as lifecycle/
 * referral's own transition DTOs (S8/S9): the server always reads the
 * real current state itself, never a client-supplied one.
 */
export class TransitionTaskDto {
  @IsIn(TASK_STATES)
  targetState!: TaskState;
}
