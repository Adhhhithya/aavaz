import { isMilestoneType, MILESTONE_TYPES } from './milestone-types';

describe('milestone-types', () => {
  it('has exactly the 3 v0.2-evidenced milestone types', () => {
    expect(MILESTONE_TYPES).toHaveLength(3);
    expect(new Set(MILESTONE_TYPES).size).toBe(3);
    expect(MILESTONE_TYPES).toEqual(
      expect.arrayContaining(['fir_filed', 'chargesheet_filed', 'relief_instalment_paid']),
    );
  });

  it('isMilestoneType rejects an unrecognized value — this is a closed set, not free text', () => {
    expect(isMilestoneType('bail_granted')).toBe(false); // plausible but not evidenced anywhere in v0.2
    expect(isMilestoneType('Chargesheet_Filed')).toBe(false); // case-sensitive
  });
});
