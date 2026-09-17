import { Module } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { LocationService } from './location.service';

/**
 * S5 slice: case-domain building blocks used by registration
 * (RegistrationService, in the identity module). Deliberately does not
 * include a controller of its own yet — there is no v0.2-required public
 * case endpoint in this slice, only registration's internal case creation.
 * See docs/S5_REGISTRATION_MIGRATION.md.
 */
@Module({
  providers: [AssignmentService, LocationService],
  exports: [AssignmentService, LocationService],
})
export class CasesModule {}
