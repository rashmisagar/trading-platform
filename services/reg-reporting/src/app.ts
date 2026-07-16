/**
 * reg-reporting — MiFID II RTS 22 transaction reporting service.
 * Receives execution events from trade, enriches them into transaction
 * reports, validates against the RTS 22 field rules, and simulates the
 * ARM's ACK/NACK. Submission is always 201: a NACKed (invalid) report is
 * still a *received* report — losing it would break completeness.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildEmirReportPair } from './domain/emirReport.js';
import { matchPair } from './domain/emirPairing.js';
import { validateEmirReport } from './domain/emirValidators.js';
import { buildMifidReport } from './domain/mifidReport.js';
import { buildSftrReportPair } from './domain/sftrReport.js';
import { matchSftrPair } from './domain/sftrPairing.js';
import { validateSftrReport } from './domain/sftrValidators.js';
import { validateMifidReport } from './domain/validators.js';
import { ReportStore } from './repo/reportStore.js';

const executionSchema = z.object({
  tradeId: z.string().min(1),
  accountId: z.string().min(1),
  symbol: z.string().min(1).max(12),
  quantity: z.number(),
  side: z.enum(['BUY', 'SELL']),
  executedPriceMinor: z.number(),
  currency: z.string(),
  executedAt: z.string(),
});

export function buildApp(store: ReportStore = new ReportStore()): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/executions', async (req, reply) => {
    const parsed = executionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_EXECUTION', details: parsed.error.issues });
    }
    const execution = parsed.data;
    store.countExecution();

    const built = buildMifidReport(execution);
    if (!built.ok) {
      // Enrichment gap: cannot construct a report at all. Tracked for
      // reconciliation — a silent drop here is a regulatory breach.
      store.countEnrichmentFailure();
      return reply.code(422).send({ error: built.reason });
    }

    const violations = validateMifidReport(built.report);
    const outcome = violations.length === 0 ? 'ACCEPTED' : 'REJECTED';
    const isNew = store.save(execution.tradeId, {
      report: built.report,
      outcome,
      violations,
      receivedAt: new Date().toISOString(),
      accountId: execution.accountId,
    });
    if (!isNew) {
      return reply
        .code(200)
        .send({ transactionReferenceNumber: execution.tradeId, duplicate: true });
    }

    // EMIR dual-sided reporting: build BOTH counterparty views, validate
    // each, then pair-and-match — the same execution feeds both regimes.
    const emirBuilt = buildEmirReportPair(execution);
    let emir: { uti: string; pairingStatus: string } | undefined;
    if (emirBuilt.ok) {
      const { pair } = emirBuilt;
      const pairing = matchPair(pair.firmReport, pair.clientReport);
      store.saveEmir(pair.uti, {
        pair,
        violations: {
          firm: validateEmirReport(pair.firmReport),
          client: validateEmirReport(pair.clientReport),
        },
        pairing,
        accountId: execution.accountId,
        receivedAt: new Date().toISOString(),
      });
      emir = { uti: pair.uti, pairingStatus: pairing.status };
    }

    // SFTR dual-sided reporting: the position's financing leg (stock loan
    // under GMSLA) — loan + collateral legs, own UTI, paired and matched.
    const sftrBuilt = buildSftrReportPair(execution);
    let sftr: { uti: string; pairingStatus: string } | undefined;
    if (sftrBuilt.ok) {
      const { pair } = sftrBuilt;
      const pairing = matchSftrPair(pair.firmReport, pair.clientReport);
      store.saveSftr(pair.uti, {
        pair,
        violations: {
          firm: validateSftrReport(pair.firmReport),
          client: validateSftrReport(pair.clientReport),
        },
        pairing,
        accountId: execution.accountId,
        receivedAt: new Date().toISOString(),
      });
      sftr = { uti: pair.uti, pairingStatus: pairing.status };
    }

    return reply.code(201).send({
      transactionReferenceNumber: execution.tradeId,
      status: outcome,
      violations,
      duplicate: false,
      emir,
      sftr,
    });
  });

  app.get('/sftr/reports/:uti', async (req, reply) => {
    const { uti } = req.params as { uti: string };
    const stored = store.getSftr(uti);
    if (!stored) return reply.code(404).send({ error: 'PAIR_NOT_FOUND' });
    return reply.code(200).send(stored);
  });

  app.get('/sftr/reports', async (req, reply) => {
    const query = z.object({ accountId: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'ACCOUNT_ID_REQUIRED' });
    return reply.code(200).send({ pairs: store.sftrByAccount(query.data.accountId) });
  });

  app.get('/emir/reports/:uti', async (req, reply) => {
    const { uti } = req.params as { uti: string };
    const stored = store.getEmir(uti);
    if (!stored) return reply.code(404).send({ error: 'PAIR_NOT_FOUND' });
    return reply.code(200).send(stored);
  });

  app.get('/emir/reports', async (req, reply) => {
    const query = z.object({ accountId: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'ACCOUNT_ID_REQUIRED' });
    return reply.code(200).send({ pairs: store.emirByAccount(query.data.accountId) });
  });

  app.get('/reports/:trn', async (req, reply) => {
    const { trn } = req.params as { trn: string };
    const stored = store.get(trn);
    if (!stored) return reply.code(404).send({ error: 'REPORT_NOT_FOUND' });
    return reply.code(200).send(stored);
  });

  app.get('/reports', async (req, reply) => {
    const query = z.object({ accountId: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'ACCOUNT_ID_REQUIRED' });
    return reply.code(200).send({ reports: store.byAccount(query.data.accountId) });
  });

  app.get('/reconciliation', async () => store.reconciliation());

  return app;
}
