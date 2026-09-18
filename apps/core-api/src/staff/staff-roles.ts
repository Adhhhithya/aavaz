/**
 * Node's own staff role vocabulary — free TEXT in the database
 * (`staff.role`), validated only here at the application layer. NOT a
 * reuse of `users.role_type_enum` (see
 * backend/migrations/0005_staff.sql's header for why). Named to align with
 * the existing FastAPI `STAFF_ROLES` set
 * (backend/api/auth/dependencies.py) where a clean match exists, plus
 * `supervisor`, which docs/S7_STAFF_CONSOLE_AUDIT.md found has no existing
 * equivalent anywhere in this codebase but is an explicit, distinct v0.2
 * role (§15: "Supervisor: District queue, SLA breaches, overrides").
 */
export const STAFF_ROLES = [
  'counsellor',
  'supervisor',
  'district_admin',
  'state_admin',
  'national_admin',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * Roles allowed to call this slice's console endpoints
 * (individual-victim/case-record access). v0.2's own access-by-role table
 * (§15) is explicit that "District oversight" (the state/national tier
 * here) sees only "Aggregates with small-count suppression" and explicitly
 * CANNOT see "Any individual record" — so `state_admin`/`national_admin`
 * are deliberately excluded here, not merely unimplemented. Aggregate/
 * oversight-tier console endpoints are out of this slice's scope entirely
 * (see docs/S7_STAFF_CONSOLE_MIGRATION.md).
 */
export const CONSOLE_INDIVIDUAL_RECORD_ROLES: readonly StaffRole[] = [
  'counsellor',
  'supervisor',
  'district_admin',
];

/**
 * Roles whose console access is scoped by case-by-case ASSIGNMENT
 * ownership (via the Decision-1 `staff.counsellorId` bridge) instead of by
 * district membership. Today this is exactly the `counsellor` role: access
 * is granted purely on `case.assignedCounsellorId === staff.counsellorId`,
 * the same single condition FastAPI's own
 * `counsellor_routes.py::get_case_detail` already uses for the
 * `counsellor` role (S7 fixes that check's broken id comparison — see
 * docs/S7_STAFF_CONSOLE_AUDIT.md Section B — it does not add a new,
 * additional district requirement on top of it). Every other
 * console-eligible role (`supervisor`, `district_admin`) is district-scope
 * only, with no per-case assignment requirement — matching v0.2's
 * "Supervisor: District queue, SLA breaches, overrides."
 */
export const ASSIGNMENT_SCOPED_ROLES: readonly StaffRole[] = ['counsellor'];
