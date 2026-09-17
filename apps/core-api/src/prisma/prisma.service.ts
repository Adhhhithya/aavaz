import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around PrismaClient, following the standard NestJS pattern so
 * the connection lifecycle is tied to the Nest application lifecycle.
 *
 * This connects to the SAME Postgres database the existing Python backend
 * uses (via DATABASE_URL) — it does not create a second database or a
 * duplicate of any table. See docs/S4_IDENTITY_MIGRATION.md.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
