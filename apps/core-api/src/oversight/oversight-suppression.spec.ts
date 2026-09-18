import { medianOf, suppressibleCount, suppressibleMedian, SUPPRESSION_THRESHOLD } from './oversight-suppression';

describe('oversight-suppression', () => {
  it('SUPPRESSION_THRESHOLD is 5, matching v0.2 Workflow H "H4"', () => {
    expect(SUPPRESSION_THRESHOLD).toBe(5);
  });

  describe('suppressibleCount', () => {
    it('suppresses any count below 5', () => {
      for (let n = 0; n < 5; n += 1) {
        expect(suppressibleCount(n)).toEqual({ count: null, suppressed: true });
      }
    });

    it('reveals a count of 5 or more', () => {
      expect(suppressibleCount(5)).toEqual({ count: 5, suppressed: false });
      expect(suppressibleCount(42)).toEqual({ count: 42, suppressed: false });
    });
  });

  describe('medianOf', () => {
    it('computes the median of an odd-length array', () => {
      expect(medianOf([1, 3, 2])).toBe(2);
    });

    it('computes the median of an even-length array as the average of the two middle values', () => {
      expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    });
  });

  describe('suppressibleMedian', () => {
    it('suppresses both the median AND the sample size when the sample is below 5', () => {
      const result = suppressibleMedian([1, 2, 3, 4]);
      expect(result).toEqual({ medianDays: null, sampleSize: null, suppressed: true });
    });

    it('reveals the median and sample size once the sample reaches 5', () => {
      const result = suppressibleMedian([1, 2, 3, 4, 5]);
      expect(result).toEqual({ medianDays: 3, sampleSize: 5, suppressed: false });
    });

    it('an empty sample is suppressed, not a fabricated zero', () => {
      const result = suppressibleMedian([]);
      expect(result.suppressed).toBe(true);
      expect(result.medianDays).toBeNull();
    });
  });
});
