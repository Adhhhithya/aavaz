export { addWorkingDays } from '../referral/referral-sla';

/**
 * v0.2 Workflow H "H3": "Escalation ladder. Stalled ticket: case manager
 * follow-up, then supervisor after 5 working days..." — read as the
 * follow-up task's own SLA due date being 5 working days from when the
 * referral reached STALLED (the moment the task is created).
 */
export const REFERRAL_STALLED_FOLLOWUP_SLA_WORKING_DAYS = 5;
