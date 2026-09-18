import { IsString, MinLength } from 'class-validator';

/**
 * `reason` is real, staff-typed free text — see
 * backend/migrations/0012_break_glass_grants.sql's header for why this
 * is a deliberate exception to this codebase's usual "IDs and codes
 * only" audit discipline. `MinLength(10)` is this slice's own,
 * NOT-spec-evidenced choice — v0.2 says "a typed reason" but names no
 * minimum; a trivially short value ("x", "urgent") would defeat the
 * purpose of requiring one at all, so a small floor is enforced here
 * rather than accepting anything non-empty.
 */
export class RequestBreakGlassDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
