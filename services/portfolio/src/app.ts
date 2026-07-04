import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PositionRepo } from './repo/positionRepo.js';

const deltaSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().min(1).max(12),
  quantityDelta: z
    .number()
    .int()
    .refine((n) => n !== 0, 'must be non-zero'),
  priceMinor: z.number().int().positive(),
  currency: z.enum(['USD', 'GBP', 'EUR']),
  idempotencyKey: z.string().min(8),
});

export function buildApp(repo: PositionRepo): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/positions/apply', async (req, reply) => {
    const parsed = deltaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_DELTA', details: parsed.error.issues });
    }
    const { position, duplicate } = await repo.apply(parsed.data);
    // 200 for an idempotent replay, 201 for a first-time apply.
    return reply.code(duplicate ? 200 : 201).send({
      accountId: position.accountId,
      symbol: position.symbol,
      quantity: position.quantity,
      avgPriceMinor: position.avgPriceMinor,
      currency: position.currency,
      duplicate,
    });
  });

  app.get('/positions/:accountId', async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    const positions = await repo.findByAccount(accountId);
    return reply.code(200).send({ accountId, positions });
  });

  return app;
}
