/**
 * Shared throwaway-PostgreSQL harness for integration tests, factored out
 * of test/identity.integration-spec.ts (S4) so S5's
 * test/registration.integration-spec.ts doesn't duplicate it. Same
 * technique documented in docs/S4_IDENTITY_MIGRATION.md's "Windows-specific
 * testing note": spins up its own isolated cluster (unique temp dir, caller-
 * chosen port), applies real backend/schema.sql plus whichever migrations
 * the caller asks for, and tears everything down afterward. No real victim
 * data — synthetic, clearly-fake identifiers only.
 *
 * identity.integration-spec.ts is intentionally left as its own
 * self-contained file rather than retrofitted to use this module — it was
 * already passing, and Phase 12 requires preserving all existing tests
 * unmodified wherever avoidable.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const PG_BIN = 'C:/Program Files/PostgreSQL/17/bin';
export const canRunPostgres = fs.existsSync(PG_BIN);
export const describeIfPostgres = canRunPostgres ? describe : describe.skip;

function pg(bin: string, args: string[], opts: Record<string, unknown> = {}): void {
  const result = spawnSync(path.join(PG_BIN, bin), args, { stdio: 'pipe', ...opts });
  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')} failed:\n${result.stderr?.toString() ?? '(no captured output; check server.log)'}`);
  }
}

export interface ThrowawayPostgres {
  pgData: string;
  port: number;
  databaseUrl: string;
}

/**
 * Starts an isolated cluster on `port`, creates `dbName`, and applies
 * backend/schema.sql followed by every migration file path in
 * `migrationFiles` (relative to backend/migrations/), in order.
 */
export async function startThrowawayPostgres(
  port: number,
  dbName: string,
  migrationFiles: string[],
): Promise<ThrowawayPostgres> {
  const pgData = fs.mkdtempSync(path.join(os.tmpdir(), 'aavaz-core-api-pgtest-'));
  pg('initdb.exe', ['-D', pgData, '-U', 'verify_user', '-A', 'trust', '--locale=C']);
  // stdio must NOT be 'pipe' here: `pg_ctl start` launches postgres.exe as a
  // detached background process on Windows, and that child inherits the
  // pipe handles Node created to capture pg_ctl's own output. postgres.exe
  // never closes them (it keeps running), so Node's synchronous pipe read
  // never sees EOF and spawnSync hangs forever even though pg_ctl itself
  // already exited successfully. Startup errors are still visible in
  // server.log, which pg_ctl's own exit code plus that log file cover. (See
  // docs/S4_IDENTITY_MIGRATION.md's "Windows-specific testing note" — this
  // was a real bug found and fixed during S4, not a hypothetical.)
  pg('pg_ctl.exe', ['-D', pgData, '-l', path.join(pgData, 'server.log'), '-o', `-p ${port}`, 'start'], {
    stdio: 'ignore',
  });

  const env = { ...process.env, PGHOST: 'localhost', PGPORT: String(port), PGUSER: 'verify_user' };
  execFileSync(path.join(PG_BIN, 'createdb.exe'), [dbName], { env });
  execFileSync(path.join(PG_BIN, 'psql.exe'), ['-d', dbName, '-c', 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'], {
    env,
  });

  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  execFileSync(path.join(PG_BIN, 'psql.exe'), ['-d', dbName, '-f', path.join(repoRoot, 'backend', 'schema.sql')], {
    env,
  });
  for (const migrationFile of migrationFiles) {
    execFileSync(
      path.join(PG_BIN, 'psql.exe'),
      ['-d', dbName, '-f', path.join(repoRoot, 'backend', 'migrations', migrationFile)],
      { env },
    );
  }

  return {
    pgData,
    port,
    databaseUrl: `postgresql://verify_user@localhost:${port}/${dbName}?schema=public`,
  };
}

export function stopThrowawayPostgres(pgData: string): void {
  try {
    pg('pg_ctl.exe', ['-D', pgData, 'stop']);
  } finally {
    fs.rmSync(pgData, { recursive: true, force: true });
  }
}
