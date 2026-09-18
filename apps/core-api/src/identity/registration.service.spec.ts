import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { AssignmentService } from '../cases/assignment.service';
import { LocationService } from '../cases/location.service';
import { AppConfig } from '../config/configuration';
import { IdentityService } from './identity.service';
import { RegistrationService } from './registration.service';
import { RegisterDto, RoleTypeInput, PreferredLanguageInput } from './dto/register.dto';

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'development',
    port: 3001,
    otpPepper: '',
    otpLength: 6,
    otpTtlSeconds: 300,
    otpMaxAttempts: 3,
    otpRateLimitWindowSeconds: 900,
    otpRateLimitPerPhone: 5,
    otpRateLimitPerIp: 20,
    victimSessionSecret: '',
    victimSessionTtlSeconds: 86400,
    phoneVerifiedTokenTtlSeconds: 600,
    staffSessionSecret: '',
    staffSessionTtlSeconds: 28800,
    ...overrides,
  };
}

function build(fake: FakePrismaService) {
  const identityService = new IdentityService(fake as unknown as PrismaService);
  const assignmentService = new AssignmentService();
  const locationService = new LocationService();
  const registrationService = new RegistrationService(
    fake as unknown as PrismaService,
    identityService,
    assignmentService,
    locationService,
  );
  return { identityService, assignmentService, locationService, registrationService };
}

const dtoWithLocation: RegisterDto = {
  name: 'Synthetic Test Victim',
  roleType: RoleTypeInput.victim,
  consentGiven: true,
  preferredLanguage: PreferredLanguageInput.en,
  location: { lat: 18.5204, lng: 73.8567 },
};

const dtoWithoutLocation: RegisterDto = {
  name: 'No Location Victim',
  roleType: RoleTypeInput.victim,
  consentGiven: true,
  preferredLanguage: PreferredLanguageInput.en,
};

describe('RegistrationService', () => {
  let fake: FakePrismaService;

  beforeEach(() => {
    fake = new FakePrismaService();
  });

  it('creates a user and a case in one call, and assigns a counsellor when the mock-resolved district has one', async () => {
    const { registrationService } = build(fake);
    fake.counsellorRows.push({
      id: 'c-1',
      name: 'Dr. Test',
      district: 'Mock District',
      languages: ['en'],
      currentCaseload: 0,
      caseloadCap: 80,
    });

    const { user, case: caseRow } = await registrationService.register('+910000000001', dtoWithLocation);

    expect(fake.userRows).toHaveLength(1);
    expect(fake.caseRows).toHaveLength(1);
    expect(caseRow.userId).toBe(user.id);
    expect(caseRow.assignedCounsellorId).toBe('c-1');
    expect(caseRow.caseType).toBe('unspecified');
    expect(caseRow.intakeChannel).toBe('app');
    expect(caseRow.caseStage).toBe('registered');
  });

  it('persists the resolved location onto the user row (mock district/state), matching Python\'s register_user', async () => {
    const { registrationService } = build(fake);
    const { user } = await registrationService.register('+910000000002', dtoWithLocation);

    const row = fake.userRows.find((u) => u.id === user.id)!;
    expect(row.locationDistrict).toBe('Mock District');
    expect(row.locationState).toBe('Mock State');
    expect(row.locationSource).toBe('app');
  });

  it('sets location_source to "app" unconditionally, even with no location submitted — matches the existing (slightly odd) FastAPI behavior exactly', async () => {
    const { registrationService } = build(fake);
    const { user } = await registrationService.register('+910000000003', dtoWithoutLocation);

    const row = fake.userRows.find((u) => u.id === user.id)!;
    expect(row.locationDistrict).toBeNull();
    expect(row.locationSource).toBe('app');
  });

  it('creates an unassigned case (no error) when no location was submitted, since assignment is only attempted when a district was resolved', async () => {
    const { registrationService } = build(fake);
    fake.counsellorRows.push({
      id: 'c-2',
      name: 'Dr. Test',
      district: 'Mock District',
      languages: ['en'],
      currentCaseload: 0,
      caseloadCap: 80,
    });

    const { case: caseRow } = await registrationService.register('+910000000004', dtoWithoutLocation);
    expect(caseRow.assignedCounsellorId).toBeNull();
  });

  it('creates an unassigned case (no error) when the resolved district has no counsellors', async () => {
    const { registrationService } = build(fake);
    // no counsellors seeded at all
    const { case: caseRow } = await registrationService.register('+910000000005', dtoWithLocation);
    expect(caseRow.assignedCounsellorId).toBeNull();
    expect(fake.caseRows).toHaveLength(1); // still created, just unassigned
  });

  it('rejects a duplicate phone number without creating a second user or case', async () => {
    const { registrationService } = build(fake);
    await registrationService.register('+910000000006', dtoWithLocation);
    await expect(registrationService.register('+910000000006', dtoWithLocation)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fake.userRows).toHaveLength(1);
    expect(fake.caseRows).toHaveLength(1);
  });

  it('never sets a cnr or ecourts_data field — registration has no legal-case-identifier code path in either implementation', async () => {
    const { registrationService } = build(fake);
    const { case: caseRow } = await registrationService.register('+910000000007', dtoWithLocation);
    expect((caseRow as unknown as { cnr?: unknown }).cnr).toBeUndefined();
    expect((caseRow as unknown as { ecourtsData?: unknown }).ecourtsData).toBeUndefined();
  });

  it('a victim can only ever be linked to their own case — case.userId always matches the just-created user, never another victim\'s id', async () => {
    const { registrationService } = build(fake);
    const a = await registrationService.register('+910000000008', { ...dtoWithLocation, name: 'Victim A' });
    const b = await registrationService.register('+910000000009', { ...dtoWithLocation, name: 'Victim B' });

    expect(a.case.userId).toBe(a.user.id);
    expect(b.case.userId).toBe(b.user.id);
    expect(a.case.userId).not.toBe(b.user.id);
  });
});
