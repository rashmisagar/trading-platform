import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type PriceSource, StaticPriceSource } from './domain/priceSource.js';

const paramsSchema = z.object({ symbol: z.string().min(1).max(12) });

export function buildApp(priceSource: PriceSource = new StaticPriceSource()): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/prices/:symbol', async (req, reply) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_SYMBOL' });
    }
    const quote = priceSource.getQuote(parsed.data.symbol);
    if (!quote) {
      return reply.code(404).send({ error: 'SYMBOL_NOT_FOUND' });
    }
    return reply.code(200).send({
      symbol: quote.symbol,
      priceMinor: quote.price.amountMinor,
      currency: quote.price.currency,
      asOf: quote.asOf,
    });
  });

  return app;
}
