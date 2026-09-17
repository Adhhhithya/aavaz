import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, PreferredLanguage, RoleType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { ResolvedLocation } from '../cases/location.service';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** See assignment.service.ts's QueryClient for why this accepts either a
 * standalone PrismaService or an in-flight transaction client. */
type QueryClient = Pick<Prisma.TransactionClient, 'user'>;

/**
 * Identity-only persistence for victims — ported from the identity-relevant
 * parts of backend/api/intake/app_routes.py::register_user and
 * backend/api/auth/victim_dependencies.py::resolve_victim_by_phone.
 *
 * S4 note (superseded): this service used to say it deliberately did not
 * create a `cases` row or run counsellor assignment. As of S5,
 * RegistrationService (identity/registration.service.ts) composes this
 * service's user-creation logic together with case creation and counsellor
 * assignment inside one Prisma transaction — see
 * docs/S5_REGISTRATION_MIGRATION.md. This service itself still only ever
 * touches the `users` table; it has no knowledge of cases or counsellors.
 */
@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async findVictimByPhone(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }

  /**
   * Unchanged from S4: identity-only, always leaves location_district/
   * location_state/location_source unset (null). Still used directly by
   * this file's own unit tests. Not called by the registration flow as of
   * S5 — see createUserForRegistration below, which RegistrationService
   * uses instead so district/state can be resolved and persisted alongside
   * case creation and assignment inside one transaction.
   */
  async registerVictim(phoneNumber: string, dto: RegisterDto): Promise<User> {
    return this.insertUser(this.prisma, phoneNumber, dto, { district: null, state: null }, false);
  }

  /**
   * The transaction-aware building block RegistrationService uses. Accepts
   * an already-resolved location (rather than resolving it itself) so this
   * service stays identity-only — location resolution is `cases`-domain
   * logic (see cases/location.service.ts). `location_source` is set to
   * `'app'` unconditionally, matching
   * backend/api/intake/app_routes.py::register_user exactly — Python sets
   * it unconditionally too, even when no location was submitted at all (see
   * docs/S5_REGISTRATION_MIGRATION.md Phase 1), so this preserves that
   * existing behavior rather than "fixing" it silently.
   */
  async createUserForRegistration(
    client: QueryClient,
    phoneNumber: string,
    dto: RegisterDto,
    location: ResolvedLocation,
  ): Promise<User> {
    return this.insertUser(client, phoneNumber, dto, location, true);
  }

  /**
   * Checks for an existing phone both up front (cheap, fails fast for the
   * common case) AND by catching the database's own unique-constraint
   * violation on the `create` call (Phase 7 concurrency: two concurrent
   * registrations for the same phone can both pass the up-front check
   * before either has committed; the database's UNIQUE constraint on
   * `phone_number` is the actual source of truth, and only one `create` can
   * ever win it — the loser gets a clean 409, not an unhandled 500).
   */
  private async insertUser(
    client: QueryClient,
    phoneNumber: string,
    dto: RegisterDto,
    location: ResolvedLocation,
    setLocationSourceApp: boolean,
  ): Promise<User> {
    const existing = await client.user.findUnique({ where: { phoneNumber } });
    if (existing) {
      throw new ConflictException('A user already exists for this phone number');
    }

    try {
      return await client.user.create({
        data: {
          phoneNumber,
          name: dto.name,
          roleType: dto.roleType as unknown as RoleType,
          preferredLanguage: dto.preferredLanguage as unknown as PreferredLanguage,
          consentGiven: dto.consentGiven,
          consentTimestamp: dto.consentGiven ? new Date() : null,
          locationLat: dto.location?.lat ?? null,
          locationLng: dto.location?.lng ?? null,
          locationDistrict: location.district,
          locationState: location.state,
          locationSource: setLocationSourceApp ? 'app' : null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new ConflictException('A user already exists for this phone number');
      }
      throw err;
    }
  }
}
