import { buildApp } from './app.js';
import { MarketDataClient } from './clients/marketDataClient.js';
import { PortfolioClient } from './clients/portfolioClient.js';

const app = buildApp({
  marketData: new MarketDataClient(process.env.MARKET_DATA_URL ?? 'http://localhost:3001'),
  portfolio: new PortfolioClient(process.env.PORTFOLIO_URL ?? 'http://localhost:3002'),
});
const port = Number(process.env.PORT ?? 3003);

app.listen({ port, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
