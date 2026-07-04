import type { Position, PositionDelta } from '../domain/position.js';
import { applyDelta } from '../domain/position.js';
import pg from 'pg';

export interface PositionRepo {
  apply(delta: PositionDelta): Promise<{ position: Position; duplicate: boolean }>;
  findByAccount(accountId: string): Promise<Position[]>;
}

/** In-memory implementation — unit tests and Pact provider verification. */
export class InMemoryPositionRepo implements PositionRepo {
  private positions = new Map<string, Position>();
  private seenKeys = new Set<string>();

  async apply(delta: PositionDelta): Promise<{ position: Position; duplicate: boolean }> {
    const key = `${delta.accountId}:${delta.symbol}`;
    if (this.seenKeys.has(delta.idempotencyKey)) {
      const existing = this.positions.get(key);
      if (!existing) throw new Error('idempotency key seen but position missing');
      return { position: existing, duplicate: true };
    }
    const next = applyDelta(this.positions.get(key), delta);
    this.positions.set(key, next);
    this.seenKeys.add(delta.idempotencyKey);
    return { position: next, duplicate: false };
  }

  async findByAccount(accountId: string): Promise<Position[]> {
    return [...this.positions.values()].filter((p) => p.accountId === accountId);
  }

  seed(position: Position): void {
    this.positions.set(`${position.accountId}:${position.symbol}`, position);
  }
}

/** Postgres implementation — integration-tested against a real database. */
export class PgPositionRepo implements PositionRepo {
  constructor(private readonly pool: pg.Pool) {}

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS positions (
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        quantity BIGINT NOT NULL,
        avg_price_minor BIGINT NOT NULL,
        currency TEXT NOT NULL,
        PRIMARY KEY (account_id, symbol)
      );
      CREATE TABLE IF NOT EXISTS applied_deltas (
        idempotency_key TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async apply(delta: PositionDelta): Promise<{ position: Position; duplicate: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Idempotency gate: first writer wins, retries are no-ops.
      const inserted = await client.query(
        'INSERT INTO applied_deltas (idempotency_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING 1',
        [delta.idempotencyKey],
      );
      const current = await client.query(
        'SELECT quantity, avg_price_minor, currency FROM positions WHERE account_id=$1 AND symbol=$2 FOR UPDATE',
        [delta.accountId, delta.symbol],
      );
      const existing: Position | undefined = current.rows[0]
        ? {
            accountId: delta.accountId,
            symbol: delta.symbol,
            quantity: Number(current.rows[0].quantity),
            avgPriceMinor: Number(current.rows[0].avg_price_minor),
            currency: current.rows[0].currency,
          }
        : undefined;

      if (inserted.rowCount === 0) {
        await client.query('COMMIT');
        if (!existing) throw new Error('idempotency key seen but position missing');
        return { position: existing, duplicate: true };
      }

      const next = applyDelta(existing, delta);
      await client.query(
        `INSERT INTO positions (account_id, symbol, quantity, avg_price_minor, currency)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (account_id, symbol)
         DO UPDATE SET quantity=$3, avg_price_minor=$4`,
        [next.accountId, next.symbol, next.quantity, next.avgPriceMinor, next.currency],
      );
      await client.query('COMMIT');
      return { position: next, duplicate: false };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findByAccount(accountId: string): Promise<Position[]> {
    const res = await this.pool.query(
      'SELECT symbol, quantity, avg_price_minor, currency FROM positions WHERE account_id=$1',
      [accountId],
    );
    return res.rows.map((r) => ({
      accountId,
      symbol: r.symbol,
      quantity: Number(r.quantity),
      avgPriceMinor: Number(r.avg_price_minor),
      currency: r.currency,
    }));
  }
}
