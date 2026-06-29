import { loadConfig } from './config';
import { Db } from './db/client';
import { Indexer } from './indexer/indexer';
import { createServer } from './api/server';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = new Db(config.databasePath);

  // Start the API server
  const app = createServer(db, config);
  const server = app.listen(config.apiPort, () => {
    console.log(`[api] Listening on port ${config.apiPort}`);
  });

  // Start the indexer loop
  const indexer = new Indexer(db, config);

  const shutdown = (): void => {
    console.log('[main] Shutting down...');
    indexer.stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await indexer.start();
}

main().catch((err) => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
