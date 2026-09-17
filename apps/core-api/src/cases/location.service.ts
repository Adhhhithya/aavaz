import { Injectable, Logger } from '@nestjs/common';

export interface ResolvedLocation {
  district: string | null;
  state: string | null;
}

/**
 * Ported 1:1 from backend/services/location_resolver.py::resolve_location.
 *
 * This is a MOCK, not real reverse geocoding — exactly like the Python
 * original, whose own comment says "In a production system, this would call
 * a real geocoding API... For now, we simulate this with a mock
 * implementation." Porting the mock (rather than skipping location
 * resolution in Node) is deliberate: counsellor assignment depends on
 * `district`, and Node registration has no district to assign against at
 * all without it — see docs/S5_REGISTRATION_MIGRATION.md Phase 2/4. This is
 * NOT new fabrication: it reproduces an existing, already-labeled-as-mock
 * behavior for parity, not a new invented data source, and the fixed
 * "Mock District"/"Mock State" strings are transparently placeholder-shaped
 * (matching backend/scripts/seed_data.py's own counsellor fixture district),
 * never disguised as real geocoded output.
 *
 * Real reverse geocoding is out of scope for this slice and remains
 * documented future work.
 */
@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  resolveLocation(lat: number | undefined, lng: number | undefined): ResolvedLocation {
    this.logger.log(`Resolving location for lat=${lat}, lng=${lng} (MOCK — not real geocoding)`);
    if (lat && lng) {
      return { district: 'Mock District', state: 'Mock State' };
    }
    return { district: null, state: null };
  }
}
