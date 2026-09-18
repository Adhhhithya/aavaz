import { IsISO8601, IsOptional } from 'class-validator';

/**
 * `metAt` is optional — if omitted, the server stamps `now()` (the
 * common case: the case manager is recording the event as it's
 * confirmed). If provided, it's read as the case manager reporting a
 * real, already-known date the event actually happened (e.g. confirming
 * during a later call that the chargesheet was filed last week) — a
 * legitimate fact, not a fabrication, the same reasoning
 * CreateMilestoneDto's `dueAt` already documents.
 */
export class MarkMilestoneMetDto {
  @IsOptional()
  @IsISO8601()
  metAt?: string;
}
