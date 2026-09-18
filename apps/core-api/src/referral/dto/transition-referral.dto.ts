import { IsIn } from 'class-validator';
import { REFERRAL_STATES, ReferralState } from '../referral-states';

/**
 * Deliberately has ONLY a target state — same rationale as
 * apps/core-api/src/lifecycle/dto/transition-lifecycle.dto.ts (S8): the
 * server always reads the real current state itself and checks the
 * transition matrix against that server-read value, never a
 * client-supplied one. No `reason` field, for the same reason S8 omitted
 * one.
 */
export class TransitionReferralDto {
  @IsIn(REFERRAL_STATES)
  targetState!: ReferralState;
}
