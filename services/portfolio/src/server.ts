import pg from 'pg';
import { buildApp } from './app.js';
import { InMemoryPositionRepo, PgPositionRepo, type PositionRepo } from './repo/positionRepo.js';

// REPO=memory supports in-process component testing and local dev without a
// database. Production always uses Postgres (the default).
async function makeRepo(): Promise<PositionRepo> {
  if (process.env.REPO === 'memory') return new InMemoryPositionRepo();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new PgPositionRepo(pool);
  await repo.migrate();
  return repo;
}

const app = buildApp(await makeRepo());
const port = Number(process.env.PORT ?? 3002);

app.listen({ port, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
