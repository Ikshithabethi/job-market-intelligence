/**
 * Express application wiring.
 *
 * Kept separate from server.js so the app can be imported by tooling without
 * binding a port.
 */
const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const db = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / curl / Postman requests have no Origin header.
      if (!origin) return callback(null, true);
      if (config.corsOrigin.includes('*') || config.corsOrigin.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: false,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

/** Liveness probe. Reports database connectivity too. */
app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    return res.json({
      success: true,
      data: {
        status: 'ok',
        database: 'connected',
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'API is running but the MySQL database is unreachable',
        code: 'DATABASE_UNAVAILABLE',
        details: error.message,
      },
    });
  }
});

app.use('/api', apiRoutes);

// Anything else is a 404, then all failures funnel through the error handler.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
