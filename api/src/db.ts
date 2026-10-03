import { Pool } from "pg";
import config from "./config";

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
  connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
  idleTimeoutMillis: config.databaseIdleTimeoutMs,
  statement_timeout: config.databaseStatementTimeoutMs,
  query_timeout: config.databaseStatementTimeoutMs,
  idle_in_transaction_session_timeout: config.databaseIdleInTransactionTimeoutMs,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export default pool;
