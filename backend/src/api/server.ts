import express from 'express';
import cors from 'cors';
import type { Db } from '../db/client';
import type { Config } from '../config';
import { treasuryRouter } from './routes/treasury';
import { historyRouter } from './routes/history';

export function createServer(db: Db, config: Config): express.Application {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    const checkpoint = db.getCheckpoint();
    res.json({
      status: 'ok',
      lastIndexedLedger: checkpoint?.last_ledger ?? 0,
    });
  });

  app.use('/api/treasury', treasuryRouter(db));
  app.use('/api/history', historyRouter(db));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}
