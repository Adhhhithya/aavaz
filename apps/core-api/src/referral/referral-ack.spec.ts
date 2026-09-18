import { generateAckToken, hashAckToken } from './referral-ack';

describe('referral-ack', () => {
  it('generates a high-entropy raw token distinct from its own hash', () => {
    const { rawToken, tokenHash } = generateAckToken();
    expect(rawToken).not.toBe(tokenHash);
    expect(rawToken.length).toBeGreaterThanOrEqual(40); // base64url of 32 random bytes
  });

  it('two generated tokens are never equal (cryptographically random, not a fixed value)', () => {
    const a = generateAckToken();
    const b = generateAckToken();
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('hashAckToken is deterministic — the same raw token always hashes the same way', () => {
    const { rawToken, tokenHash } = generateAckToken();
    expect(hashAckToken(rawToken)).toBe(tokenHash);
  });

  it('a different raw token produces a different hash', () => {
    const a = generateAckToken();
    const b = generateAckToken();
    expect(hashAckToken(a.rawToken)).not.toBe(hashAckToken(b.rawToken));
  });

  it('the hash is a 64-character hex string (SHA-256)', () => {
    const { tokenHash } = generateAckToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
