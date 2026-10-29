/**
 * Environment configuration.
 *
 * Loads backend/.env (if present) with dotenv and exposes a single validated
 * config object so no other file has to read process.env directly.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 5050),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'job_market_intelligence',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-to-a-long-random-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 10),

  // Paths used by the seed script and the Python analysis bridge.
  paths: {
    dataDir: path.resolve(__dirname, '..', '..', 'data'),
    pythonOutputDir: path.resolve(__dirname, '..', '..', 'python-analysis', 'output'),
  },
};

config.isProduction = config.nodeEnv === 'production';

if (config.jwt.secret === 'change-this-to-a-long-random-secret') {
  // Warn loudly but keep the server usable for local marking / demos.
  // eslint-disable-next-line no-console
  console.warn(
    '[config] JWT_SECRET is still the example value. Set a real secret in backend/.env before deploying.'
  );
}

module.exports = config;
