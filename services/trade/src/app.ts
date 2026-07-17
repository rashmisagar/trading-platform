import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MarketDataClient } from './clients/marketDataClient.js';
import type { PortfolioClient } from './clients/portfolioClient.js';
import type { RegReportingClient } from './clients/regReportingClient.js';
import { validateTrade } from './domain/tradeValidator.js';

const tradeSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().min(1).max(12),
  quantity: z.number().int().positive(),
  side: z.enum(['BUY', 'SELL']),
});

export interface TradeDeps {
  marketData: MarketDataClient;
  portfolio: PortfolioClient;
  /** Optional: MiFID II transaction reporting. Absent ⇒ reporting disabled. */
  regReporting?: RegReportingClient;
}

export function buildApp(deps: TradeDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/trades', async (req, reply) => {
    const parsed = tradeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_TRADE', details: parsed.error.issues });
    }
    const trade = parsed.data;

    // 1. Price the order — fail closed if market data is unavailable.
    const quoteResult = await deps.marketData.getQuote(trade.symbol);
    if (!quoteResult.ok) {
      const status = quoteResult.reason === 'SYMBOL_NOT_FOUND' ? 422 : 503;
      return reply.code(status).send({ error: quoteResult.reason });
    }
    const { quote } = quoteResult;

    // 2. Pre-trade validation (pure domain).
    const validation = validateTrade(trade, quote.priceMinor);
    if (!validation.valid) {
      return reply.code(422).send({ error: validation.reason });
    }

    // 3. Book the position — idempotency key means a client retry of THIS
    //    trade id can never double-book.
    const tradeId = `trd-${randomUUID()}`;
    const applied = await deps.portfolio.applyDelta({
      accountId: trade.accountId,
      symbol: quote.symbol,
      quantityDelta: trade.side === 'BUY' ? trade.quantity : -trade.quantity,
      priceMinor: quote.priceMinor,
      currency: quote.currency,
      idempotencyKey: tradeId,
    });
    if (!applied.ok) {
      const status = applied.reason === 'PORTFOLIO_REJECTED' ? 422 : 503;
      return reply.code(status).send({ error: applied.reason });
    }

    // 4. Transaction reporting — fire-and-forget: a reporting outage must
    //    never halt trading. Dispatch is deferred with setImmediate so even
    //    the submission's serialization cost stays OFF the trading latency
    //    path (asserted by the nightly load SLOs). Completeness is owned by
    //    reg-reporting's reconciliation (in production: outbox + replay,
    //    not best-effort HTTP); the client never throws.
    if (deps.regReporting) {
      const { regReporting } = deps;
      const executedAt = new Date().toISOString();
      setImmediate(() => {
        void regReporting
          .reportExecution({
            tradeId,
            accountId: trade.accountId,
            symbol: quote.symbol,
            quantity: trade.quantity,
            side: trade.side,
            executedPriceMinor: quote.priceMinor,
            currency: quote.currency,
            executedAt,
          })
          .then((result) => {
            if (!result.ok) app.log.error({ tradeId }, 'transaction report submission failed');
          });
      });
    }

    return reply.code(201).send({
      tradeId,
      status: 'EXECUTED',
      symbol: quote.symbol,
      executedPriceMinor: quote.priceMinor,
      currency: quote.currency,
      position: applied.position,
    });
  });

  return app;
}
