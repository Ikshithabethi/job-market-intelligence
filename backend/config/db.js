/**
 * MySQL connection pool (mysql2/promise) plus small query helpers.
 *
 * Every service goes through these helpers so that parameter binding, row
 * limiting and error translation stay in one place.
 */
const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  // Return DECIMAL/BIGINT columns as JS numbers so JSON responses are clean.
  decimalNumbers: true,
  dateStrings: ['DATE'],
});

/**
 * Run a parameterised query.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Promise<Array>} rows
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Run a query and return the first row (or null).
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Run a statement that returns a single scalar value.
 */
async function queryScalar(sql, params = []) {
  const row = await queryOne(sql, params);
  if (!row) return null;
  const keys = Object.keys(row);
  return keys.length > 0 ? row[keys[0]] : null;
}

/**
 * Run several statements inside one transaction.
 * The callback receives a connection-scoped `exec` helper.
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const exec = async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    };
    const result = await callback(exec, connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Bulk insert helper: builds "INSERT INTO t (a,b) VALUES (?,?),(?,?)" chunks.
 * Used by the seed script for the large CSV files.
 */
async function bulkInsert(exec, table, columns, rows, chunkSize = 500) {
  if (rows.length === 0) return 0;
  const columnList = columns.join(', ');
  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
  let inserted = 0;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => rowPlaceholder).join(', ');
    const values = chunk.reduce((acc, row) => acc.concat(row), []);
    // eslint-disable-next-line no-await-in-loop
    await exec(`INSERT INTO ${table} (${columnList}) VALUES ${placeholders}`, values);
    inserted += chunk.length;
  }
  return inserted;
}

async function ping() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  query,
  queryOne,
  queryScalar,
  withTransaction,
  bulkInsert,
  ping,
  escapeId: mysql.escapeId,
};
