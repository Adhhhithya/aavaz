import { Injectable, Logger } from '@nestjs/common';
import { Case, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentService } from '../cases/assignment.service';
import { LocationService } from '../cases/location.service';
import { IdentityService } from './identity.service';
import { RegisterDto } from './dto/register.dto';

export interface RegistrationResult {
  user: User;
  case: Case;
}

/**
 * Orchestrates registration -> identity -> case creation -> counsellor
 * assignment as ONE Prisma transaction — the Node equivalent of
 * backend/api/intake/app_routes.py::register_user, which does the same
 * three things but as three separate, non-transactional Supabase calls.
 *
 * Phase 6 (transactional integrity): the existing FastAPI implementation
 * has no transaction boundary at all. If case creation fails after the user
 * row and the counsellor-caseload increment have already committed, the
 * result is a user with no case AND a counsellor's caseload permanently
 * inflated for a case that was never created — this is not a documented,
 * intentional legacy behavior, it is an unexamined bug (nothing in
 * app_routes.py or the audit ever discusses this as deliberate). Per the
 * task's explicit instruction ("do not create a victim successfully while
 * silently failing case creation unless the specification/legacy behavior
 * explicitly requires such behavior" — it does not), this is a case where
 * Node deliberately does NOT preserve the existing behavior: user creation,
 * counsellor assignment, and case creation all happen inside one
 * `prisma.$transaction`, so a failure at any point rolls back all of it —
 * no orphaned user, no orphaned caseload increment. See
 * docs/S5_REGISTRATION_MIGRATION.md Phase 6 and the failure-path test in
 * registration.service.spec.ts / the integration suite.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly assignmentService: AssignmentService,
    private readonly locationService: LocationService,
  ) {}

  async register(phoneNumber: string, dto: RegisterDto): Promise<RegistrationResult> {
    const location = this.locationService.resolveLocation(dto.location?.lat, dto.location?.lng);

    return this.prisma.$transaction(async (tx) => {
      const user = await this.identityService.createUserForRegistration(tx, phoneNumber, dto, location);

      // Matches app_routes.py::register_user exactly: assignment is only
      // attempted at all if a district was resolved; a null district never
      // calls assign_counsellor and the case is created unassigned.
      const counsellor = location.district
        ? await this.assignmentService.assign(tx, location.district, dto.preferredLanguage)
        : null;

      const caseRow = await tx.case.create({
        data: {
          userId: user.id,
          // Fixed values, matching app_routes.py::register_user exactly —
          // not client-controlled, same as the existing implementation.
          caseType: 'unspecified',
          intakeChannel: 'app',
          caseStage: 'registered',
          assignedCounsellorId: counsellor?.id ?? null,
          // cnr / ecourts_data are deliberately never set here — see
          // prisma/schema.prisma's Case model comment and
          // docs/S5_REGISTRATION_MIGRATION.md Phase 4. Registration has
          // never touched case identifiers in either implementation.
        },
      });

      this.logger.log(
        `Registered user ${user.id} with case ${caseRow.id}` +
          (counsellor ? ` assigned to counsellor ${counsellor.id}` : ' (unassigned — no eligible counsellor)'),
      );

      return { user, case: caseRow };
    });
  }
}
