/**
 * PROVIDER VERIFICATION — portfolio side of the trade↔portfolio contract.
 * Uses the in-memory repo so verification needs no database: contract tests
 * verify the INTERFACE, not the persistence (that's the integration suite).
 */
import { Verifier } from '@pact-foundation/pact';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { InMemoryPositionRepo } from '../../src/repo/positionRepo.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname_ = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3902;

describe('portfolio honours the pact published by trade', () => {
  const repo = new InMemoryPositionRepo();
  const app = buildApp(repo);

  beforeAll(async () => {
    await app.listen({ port: PORT, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('verifies all interactions', async () => {
    const verifier = new Verifier({
      provider: 'portfolio',
      providerBaseUrl: `http://127.0.0.1:${PORT}`,
      pactUrls: [path.resolve(dirname_, '../../../../pacts/trade-portfolio.json')],
      stateHandlers: {
        'account acc-1 can accept position updates': async () => 'ready',
      },
    });
    await verifier.verifyProvider();
  }, 60_000);
});
