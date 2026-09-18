import { IsIn, IsObject } from 'class-validator';
import { DESTINATION_TYPES, DestinationType } from '../referral-destinations';

/**
 * `fields` is deliberately untyped at the DTO layer (validated instead by
 * referral-packets.ts::buildReferralPacket, which throws
 * BadRequestException for any missing/empty required field for the chosen
 * `destinationType`) — class-validator has no clean discriminated-union
 * story without a second library, and the packet builder is already the
 * single place that enforces "only this destination's fields, all of them
 * present" per referral-destinations.ts's structural-typing design. No
 * `caseManagerNotes`/free-text field beyond what each destination's own
 * required fields already are is accepted — see ReferralService for the
 * full mapping.
 */
export class DraftReferralDto {
  @IsIn(DESTINATION_TYPES)
  destinationType!: DestinationType;

  @IsObject()
  fields!: Record<string, unknown>;
}
