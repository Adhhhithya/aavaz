import {
  isTaskPriority,
  isTaskState,
  isTaskType,
  isValidTaskTransition,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  TaskState,
} from './task-states';

describe('task-states', () => {
  it('has exactly the 4 task states', () => {
    expect(TASK_STATES).toHaveLength(4);
    expect(new Set(TASK_STATES).size).toBe(4);
    expect(TASK_STATES).toEqual(expect.arrayContaining(['OPEN', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED']));
  });

  it('isTaskState rejects an unrecognized value', () => {
    expect(isTaskState('NOT_A_REAL_STATE')).toBe(false);
    expect(isTaskState('open')).toBe(false); // case-sensitive
  });

  describe('valid transitions', () => {
    const cases: Array<[TaskState, TaskState]> = [
      ['OPEN', 'ACKNOWLEDGED'],
      ['OPEN', 'CANCELLED'],
      ['ACKNOWLEDGED', 'COMPLETED'],
      ['ACKNOWLEDGED', 'CANCELLED'],
    ];
    it.each(cases)('%s -> %s is permitted', (from, to) => {
      expect(isValidTaskTransition(from, to)).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    const cases: Array<[TaskState, TaskState]> = [
      ['OPEN', 'COMPLETED'], // must go through ACKNOWLEDGED
      ['COMPLETED', 'OPEN'], // terminal
      ['COMPLETED', 'ACKNOWLEDGED'],
      ['CANCELLED', 'OPEN'], // terminal
      ['CANCELLED', 'ACKNOWLEDGED'],
    ];
    it.each(cases)('%s -> %s is rejected', (from, to) => {
      expect(isValidTaskTransition(from, to)).toBe(false);
    });
  });

  it('rejects a self-transition for every state', () => {
    for (const state of TASK_STATES) {
      expect(isValidTaskTransition(state, state)).toBe(false);
    }
  });

  it('terminal states (COMPLETED, CANCELLED) have zero outgoing transitions', () => {
    for (const target of TASK_STATES) {
      expect(isValidTaskTransition('COMPLETED', target)).toBe(false);
      expect(isValidTaskTransition('CANCELLED', target)).toBe(false);
    }
  });

  it('has exactly the 3 evidenced, wired task types (S12: referral_stalled/referral_review; S14: unassigned_case)', () => {
    expect(TASK_TYPES).toEqual(expect.arrayContaining(['referral_stalled', 'referral_review', 'unassigned_case']));
    expect(TASK_TYPES).toHaveLength(3);
  });

  it('isTaskType rejects a plausible-but-still-unwired type (e.g. from an evidenced-but-deferred trigger)', () => {
    expect(isTaskType('court_sync_stale')).toBe(false); // evidenced (B4) but deliberately not wired — needs infra
    expect(isTaskType('silence')).toBe(false); // evidenced (silence-ladder sample) but deliberately not wired — needs infra
  });

  it('has exactly the 4 evidenced task priorities, excluding good', () => {
    expect(TASK_PRIORITIES).toEqual(expect.arrayContaining(['okay', 'bad', 'serious', 'critical']));
    expect(TASK_PRIORITIES).toHaveLength(4);
    expect(isTaskPriority('good')).toBe(false);
  });
});
