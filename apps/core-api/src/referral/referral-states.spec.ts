import { isReferralState, isValidReferralTransition, REFERRAL_STATES, ReferralState } from './referral-states';

describe('referral-states', () => {
  it('has exactly the 12 v0.2 referral states', () => {
    expect(REFERRAL_STATES).toHaveLength(12);
    expect(new Set(REFERRAL_STATES).size).toBe(12); // no duplicates
    expect(REFERRAL_STATES).toEqual(
      expect.arrayContaining([
        'DRAFTED',
        'APPROVED',
        'AWAITING_CONSENT',
        'SENT',
        'ACKNOWLEDGED',
        'IN_SERVICE',
        'DELIVERED',
        'VERIFIED',
        'BOUNCED',
        'STALLED',
        'DISCARDED',
        'CLOSED_UNRESOLVED',
      ]),
    );
  });

  it('isReferralState rejects an unrecognized value', () => {
    expect(isReferralState('NOT_A_REAL_STATE')).toBe(false);
    expect(isReferralState('sent')).toBe(false); // case-sensitive
  });

  describe('valid transitions (evidenced by the diagram reconstruction + G1-G5/H1-H4 prose)', () => {
    const cases: Array<[ReferralState, ReferralState]> = [
      ['DRAFTED', 'APPROVED'],
      ['APPROVED', 'SENT'],
      ['APPROVED', 'AWAITING_CONSENT'],
      ['AWAITING_CONSENT', 'SENT'],
      ['AWAITING_CONSENT', 'DISCARDED'],
      ['SENT', 'BOUNCED'],
      ['BOUNCED', 'SENT'],
      ['SENT', 'ACKNOWLEDGED'],
      ['ACKNOWLEDGED', 'IN_SERVICE'],
      ['IN_SERVICE', 'DELIVERED'],
      ['DELIVERED', 'VERIFIED'],
      ['SENT', 'STALLED'],
      ['ACKNOWLEDGED', 'STALLED'],
      ['STALLED', 'SENT'],
      ['STALLED', 'CLOSED_UNRESOLVED'],
    ];
    it.each(cases)('%s -> %s is permitted', (from, to) => {
      expect(isValidReferralTransition(from, to)).toBe(true);
    });
  });

  describe('invalid transitions (no evidence in the spec for these)', () => {
    const cases: Array<[ReferralState, ReferralState]> = [
      ['DRAFTED', 'SENT'], // must go through APPROVED
      ['DRAFTED', 'DISCARDED'], // no evidenced edge — only AWAITING_CONSENT -> DISCARDED is evidenced
      ['APPROVED', 'DISCARDED'],
      ['SENT', 'DELIVERED'], // must go through ACKNOWLEDGED, IN_SERVICE
      ['SENT', 'VERIFIED'],
      ['IN_SERVICE', 'STALLED'], // no SLA checkpoint evidenced this late
      ['DELIVERED', 'STALLED'],
      ['VERIFIED', 'SENT'], // terminal
      ['DISCARDED', 'SENT'], // terminal
      ['CLOSED_UNRESOLVED', 'SENT'], // terminal
      ['CLOSED_UNRESOLVED', 'STALLED'],
    ];
    it.each(cases)('%s -> %s is rejected', (from, to) => {
      expect(isValidReferralTransition(from, to)).toBe(false);
    });
  });

  it('rejects a self-transition for every state, even ones with real outgoing edges', () => {
    for (const state of REFERRAL_STATES) {
      expect(isValidReferralTransition(state, state)).toBe(false);
    }
  });

  it('terminal states (VERIFIED, DISCARDED, CLOSED_UNRESOLVED) have zero outgoing transitions', () => {
    for (const target of REFERRAL_STATES) {
      expect(isValidReferralTransition('VERIFIED', target)).toBe(false);
      expect(isValidReferralTransition('DISCARDED', target)).toBe(false);
      expect(isValidReferralTransition('CLOSED_UNRESOLVED', target)).toBe(false);
    }
  });
});
