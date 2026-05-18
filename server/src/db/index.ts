/**
 * Azure SQL connection pool. Uses managed identity in production
 * (`Authentication=ActiveDirectoryDefault`) so no password lives in env vars.
 *
 * Stub. Wire in the next session — see `electron/db/queries.ts` for the SQLite
 * implementation to port. Translation patterns in `db/migrations/0001_initial_schema.sql`.
 */

import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool;
  const connStr = process.env.AZURE_SQL_CONNECTION_STRING;
  if (!connStr) {
    throw new Error(
      'AZURE_SQL_CONNECTION_STRING not set. ' +
        'In production set via App Service Configuration; locally use .env.',
    );
  }
  pool = await new sql.ConnectionPool(connStr).connect();
  return pool;
}
