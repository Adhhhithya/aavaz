import { isLifecycleState, isValidTransition, LIFECYCLE_STATES, LifecycleState } from './lifecycle-states';

describe('lifecycle-states', () => {
  it('has exactly the 11 v0.2 states', () => {
    expect(LIFECYCLE_STATES).toHaveLength(11);
    expect(new Set(LIFECYCLE_STATES).size).toBe(11); // no duplicates
    expect(LIFECYCLE_STATES).toEqual(
      expect.arrayContaining([
        'PENDING_CONSENT',
        'REGISTERED',
        'VERIFIED',
        'MONITORING',
        'ESCALATED',
        'REFERRED',
        'PAUSED',
        'CLOSING',
        'CLOSED',
        'OPTED_OUT',
        'PURGED',
      ]),
    );
  });

  it('isLifecycleState rejects an unrecognized value', () => {
    expect(isLifecycleState('NOT_A_REAL_STATE')).toBe(false);
    expect(isLifecycleState('monitoring')).toBe(false); // case-sensitive
  });

  describe('valid transitions (evidenced by the diagram reconstruction)', () => {
    const cases: Array<[LifecycleState, LifecycleState]> = [
      ['PENDING_CONSENT', 'REGISTERED'],
      ['REGISTERED', 'VERIFIED'],
      ['REGISTERED', 'MONITORING'],
      ['VERIFIED', 'MONITORING'],
      ['MONITORING', 'ESCALATED'],
      ['MONITORING', 'PAUSED'],
      ['PAUSED', 'MONITORING'],
      ['ESCALATED', 'REFERRED'],
      ['REFERRED', 'MONITORING'],
      ['MONITORING', 'CLOSING'],
      ['ESCALATED', 'CLOSING'],
      ['REFERRED', 'CLOSING'],
      ['PAUSED', 'CLOSING'],
      ['MONITORING', 'OPTED_OUT'],
      ['ESCALATED', 'OPTED_OUT'],
      ['REFERRED', 'OPTED_OUT'],
      ['PAUSED', 'OPTED_OUT'],
      ['CLOSING', 'CLOSED'],
      ['CLOSED', 'PURGED'],
      ['OPTED_OUT', 'PURGED'],
    ];
    it.each(cases)('%s -> %s is permitted', (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    });
  });

  describe('invalid transitions (no evidence in the spec for these)', () => {
    const cases: Array<[LifecycleState, LifecycleState]> = [
      ['PENDING_CONSENT', 'MONITORING'], // must go through REGISTERED
      ['PENDING_CONSENT', 'OPTED_OUT'], // no pre-monitoring opt-out edge evidenced
      ['REGISTERED', 'ESCALATED'], // must go through MONITORING
      ['REGISTERED', 'PAUSED'],
      ['VERIFIED', 'ESCALATED'], // must go through MONITORING
      ['MONITORING', 'REFERRED'], // must go through ESCALATED
      ['MONITORING', 'CLOSED'], // must go through CLOSING
      ['CLOSED', 'MONITORING'], // terminal
      ['CLOSED', 'REGISTERED'], // terminal
      ['PURGED', 'REGISTERED'], // terminal
      ['OPTED_OUT', 'MONITORING'], // terminal except -> PURGED
      ['CLOSING', 'MONITORING'], // no back-edge evidenced
    ];
    it.each(cases)('%s -> %s is rejected', (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  });

  it('rejects a self-transition for every state, even ones with real outgoing edges', () => {
    for (const state of LIFECYCLE_STATES) {
      expect(isValidTransition(state, state)).toBe(false);
    }
  });

  it('terminal states (CLOSED, PURGED) have zero outgoing transitions except where evidenced (CLOSED -> PURGED)', () => {
    expect(isValidTransition('PURGED', 'CLOSED')).toBe(false);
    expect(isValidTransition('PURGED', 'OPTED_OUT')).toBe(false);
  });
});
