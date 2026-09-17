import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import configuration from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { getOtpProvider } from './otp-provider';

/**
 * Real OTP issuance and verification — ported from
 * backend/services/otp_service.py onto the SAME `otp_codes` table (via
 * Prisma instead of supabase-py). See docs/S4_IDENTITY_MIGRATION.md for the
 * full component mapping.
 *
 * Security properties preserved from the Python implementation:
 * - Codes are never stored or logged in plaintext — only an HMAC-SHA256 hash
 *   (per-code random salt + a server-side pepper) is persisted.
 * - Verification compares hashes with crypto.timingSafeEqual (Node's
 *   constant-time comparison, equivalent to Python's hmac.compare_digest).
 * - Phone numbers are hashed (HMAC-SHA256 + pepper) for the lookup key in
 *   THIS table only — this does not change how `users.phone_number` itself
 *   is stored (still plaintext — a separate, deferred concern, unchanged
 *   from the Python side).
 * - Rate limiting is enforced per phone and per IP over a rolling window.
 * - A code can be consumed exactly once and has a hard attempt cap.
 */

export class OtpError extends Error {}
export class RateLimitedError extends OtpError {}
export class InvalidOtpError extends OtpError {}
export class ExpiredOtpError extends OtpError {}

const DEV_INSECURE_PEPPER = 'dev-only-insecure-otp-pepper-do-not-use-in-production';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(configuration.KEY)
    private readonly config: ConfigType<typeof configuration>,
  ) {}

  private pepper(): string {
    if (this.config.otpPepper) {
      return this.config.otpPepper;
    }
    if (this.config.nodeEnv.trim().toLowerCase() === 'development') {
      return DEV_INSECURE_PEPPER;
    }
    throw new Error(
      'OTP_PEPPER is not configured. Refusing to hash OTP secrets with no pepper outside a development environment.',
    );
  }

  hashPhone(value: string): string {
    return crypto.createHmac('sha256', this.pepper()).update(value.trim()).digest('hex');
  }

  private hashCode(code: string, salt: string): string {
    return crypto.createHmac('sha256', this.pepper()).update(`${salt}:${code}`).digest('hex');
  }

  /** Cryptographically-random, zero-padded numeric code (crypto.randomInt,
   * not Math.random). */
  generateCode(length: number = this.config.otpLength): string {
    const max = 10 ** length;
    const value = crypto.randomInt(0, max);
    return value.toString().padStart(length, '0');
  }

  private async countRecent(column: 'phoneHash' | 'ipHash', value: string, windowSeconds: number): Promise<number> {
    const since = new Date(Date.now() - windowSeconds * 1000);
    return this.prisma.otpCode.count({
      where: { [column]: value, createdAt: { gte: since } } as never,
    });
  }

  /**
   * Generates, hashes, stores, and dispatches an OTP.
   *
   * Throws RateLimitedError if this phone or IP has requested too many codes
   * recently. Never returns, logs, or persists the plaintext code beyond the
   * single call to the delivery provider.
   */
  async requestOtp(phoneNumber: string, ipAddress?: string, purpose: string = 'login'): Promise<void> {
    const phoneHash = this.hashPhone(phoneNumber);
    const ipHash = ipAddress ? this.hashPhone(ipAddress) : undefined;

    const recentForPhone = await this.countRecent(
      'phoneHash',
      phoneHash,
      this.config.otpRateLimitWindowSeconds,
    );
    if (recentForPhone >= this.config.otpRateLimitPerPhone) {
      throw new RateLimitedError('Too many OTP requests for this phone number');
    }

    if (ipHash) {
      const recentForIp = await this.countRecent('ipHash', ipHash, this.config.otpRateLimitWindowSeconds);
      if (recentForIp >= this.config.otpRateLimitPerIp) {
        throw new RateLimitedError('Too many OTP requests from this network');
      }
    }

    const code = this.generateCode();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = this.hashCode(code, salt);
    const expiresAt = new Date(Date.now() + this.config.otpTtlSeconds * 1000);

    await this.prisma.otpCode.create({
      data: {
        phoneHash,
        codeHash,
        salt,
        purpose,
        ipHash,
        attempts: 0,
        maxAttempts: this.config.otpMaxAttempts,
        expiresAt,
      },
    });

    const provider = getOtpProvider(this.config.nodeEnv);
    await provider.sendOtp(phoneNumber, code, 'sms');
    // `code` and `salt` go out of scope here. Only their hash is persisted.
  }

  /**
   * Verifies `submittedCode` against the most recent unconsumed OTP issued
   * for this phone/purpose. Throws ExpiredOtpError or InvalidOtpError on
   * failure. On success, marks the row consumed so it cannot be replayed.
   */
  async verifyOtp(phoneNumber: string, submittedCode: string, purpose: string = 'login'): Promise<void> {
    const phoneHash = this.hashPhone(phoneNumber);

    const row = await this.prisma.otpCode.findFirst({
      where: { phoneHash, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) {
      throw new InvalidOtpError('No pending OTP for this phone number');
    }

    if (new Date() > row.expiresAt) {
      throw new ExpiredOtpError('OTP has expired');
    }

    if (row.attempts >= row.maxAttempts) {
      throw new InvalidOtpError('Maximum verification attempts exceeded');
    }

    const expectedHash = this.hashCode(submittedCode, row.salt);
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    const actualBuf = Buffer.from(row.codeHash, 'hex');

    const matches =
      expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!matches) {
      await this.prisma.otpCode.update({
        where: { id: row.id },
        data: { attempts: row.attempts + 1 },
      });
      throw new InvalidOtpError('Incorrect code');
    }

    await this.prisma.otpCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
  }
}
