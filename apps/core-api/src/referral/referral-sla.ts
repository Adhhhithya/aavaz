/**
 * Working-day arithmetic for v0.2 Workflow G's "G5" SLA rule ("Default
 * acknowledgement within 3 working days, service start within 10").
 * "Working day" is read as Mon-Fri, no public-holiday calendar — v0.2 does
 * not specify one, and inventing a holiday calendar would be exactly the
 * kind of unevidenced business rule this milestone's instructions warn
 * against. Documented here, not silently assumed.
 */
export function addWorkingDays(start: Date, workingDays: number): Date {
  const result = new Date(start.getTime());
  let remaining = workingDays;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return result;
}

export const ACKNOWLEDGEMENT_SLA_WORKING_DAYS = 3;
export const SERVICE_START_SLA_WORKING_DAYS = 10;
