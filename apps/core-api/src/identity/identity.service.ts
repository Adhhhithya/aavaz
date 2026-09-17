import { ConflictException, Injectable } from '@nestjs/common';
import { PreferredLanguage, RoleType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

/**
 * Identity-only persistence for victims — ported from the identity-relevant
 * parts of backend/api/intake/app_routes.py::register_user and
 * backend/api/auth/victim_dependencies.py::resolve_victim_by_phone.
 *
 * Deliberately does NOT create a `cases` row or run counsellor assignment —
 * see docs/S4_IDENTITY_MIGRATION.md for why that's out of this slice's scope.
 */
@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async findVictimByPhone(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }

  async registerVictim(phoneNumber: string, dto: RegisterDto): Promise<User> {
    const existing = await this.findVictimByPhone(phoneNumber);
    if (existing) {
      // Matches the Python behavior: a duplicate phone is rejected, not
      // silently merged or overwritten (schema.sql has phone_number UNIQUE).
      throw new ConflictException('A user already exists for this phone number');
    }

    return this.prisma.user.create({
      data: {
        phoneNumber,
        name: dto.name,
        roleType: dto.roleType as unknown as RoleType,
        preferredLanguage: dto.preferredLanguage as unknown as PreferredLanguage,
        consentGiven: dto.consentGiven,
        consentTimestamp: dto.consentGiven ? new Date() : null,
        locationLat: dto.location?.lat ?? null,
        locationLng: dto.location?.lng ?? null,
        // locationSource/locationDistrict/locationState are intentionally
        // left unset here — resolving district/state from lat/lng is
        // `profile-case`-domain logic (services/location_resolver.py on the
        // Python side, itself a mock today), not identity logic. Assigning
        // it here would be exactly the "speculative architecture beyond
        // this slice" the task instructs against.
      },
    });
  }
}
