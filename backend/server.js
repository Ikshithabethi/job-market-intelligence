/**
 * HTTP server entry point.
 *
 * Verifies the database connection before accepting traffic so configuration
 * mistakes surface immediately instead of as confusing 500s.
 */
const app = require('./app');
const config = require('./config/env');
const db = require('./config/db');

async function start() {
  try {
    await db.ping();
    // eslint-disable-next-line no-console
    console.log(
      `[db] connected to mysql://${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[db] connection failed:', error.message);
    // eslint-disable-next-line no-console
    console.error(
      `[db] check that MySQL is running and that backend/.env matches your setup (host=${config.db.host}, port=${config.db.port}, user=${config.db.user}, database=${config.db.database}).`
    );
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${config.port}`);
    // eslint-disable-next-line no-console
    console.log(`[api] health check: http://localhost:${config.port}/api/health`);
    // eslint-disable-next-line no-console
    console.log(`[api] allowed CORS origins: ${config.corsOrigin.join(', ')}`);
  });

  const shutdown = (signal) => () => {
    // eslint-disable-next-line no-console
    console.log(`\n[api] received ${signal}, shutting down`);
    server.close(() => {
      db.pool
        .end()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

start();

module.exports = start;
