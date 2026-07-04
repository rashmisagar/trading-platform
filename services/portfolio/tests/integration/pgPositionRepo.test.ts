/**
 * INTEGRATION — the boundary between our SQL and a real Postgres.
 * Needs DATABASE_URL (CI provides a service container; locally:
 *   docker compose -f docker-compose.e2e.yml up -d postgres
 * Skips gracefully when no database is available so `npm test` never
 * mysteriously fails on a laptop without Docker.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgPositionRepo } from '../../src/repo/positionRepo.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:test@localhost:5432/testdb';

let pool: pg.Pool;
let repo: PgPositionRepo;
let available = true;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    repo = new PgPositionRepo(pool);
    await repo.migrate();
  } catch {
    available = false;
  }
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('TRUNCATE positions, applied_deltas');
});

describe.skipIf(() => !available)('PgPositionRepo against real Postgres', () => {
  it('persists and reloads a position with integer precision intact', async () => {
    await repo.apply({
      accountId: 'acc-1',
      symbol: 'AAPL',
      quantityDelta: 10,
      priceMinor: 18950,
      currency: 'USD',
      idempotencyKey: 'ik-int-1',
    });
    const positions = await repo.findByAccount('acc-1');
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ symbol: 'AAPL', quantity: 10, avgPriceMinor: 18950 });
  });

  it('enforces idempotency at the database level — replay does not double-apply', async () => {
    const delta = {
      accountId: 'acc-1',
      symbol: 'AAPL',
      quantityDelta: 10,
      priceMinor: 18950,
      currency: 'USD',
      idempotencyKey: 'ik-dup-1',
    };
    const first = await repo.apply(delta);
    const replay = await repo.apply(delta);
    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.position.quantity).toBe(10);
  });

  it('applies concurrent deltas for the same position without losing updates', async () => {
    // FOR UPDATE row lock is what this proves — 10 concurrent buys of 1 → qty 10.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        repo.apply({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantityDelta: 1,
          priceMinor: 10000,
          currency: 'USD',
          idempotencyKey: `ik-conc-${i}`,
        }),
      ),
    );
    const positions = await repo.findByAccount('acc-1');
    expect(positions[0]?.quantity).toBe(10);
  });
});
