import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { MILESTONE_TYPES, MilestoneType } from '../milestone-types';

/**
 * `dueAt` is genuinely staff-entered factual data (a real, known date the
 * case manager is recording — e.g. "the chargesheet is due by this
 * date"), not a security- or authorization-relevant value, so accepting
 * it from the client is safe here unlike a lifecycle/referral/task
 * target-state field (which the server always determines itself). No
 * `metAt` here — creating a milestone always starts it unmet; marking it
 * met is a separate action (MarkMilestoneMetDto), matching this domain's
 * own "record now, confirm later" shape.
 */
export class CreateMilestoneDto {
  @IsIn(MILESTONE_TYPES)
  type!: MilestoneType;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}
