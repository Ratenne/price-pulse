import { Pool, type PoolConfig } from "pg";

let pool: Pool | undefined;

function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Expected a positive integer configuration value, received: ${value}`
    );
  }
  return parsed;
}

export function createDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): PoolConfig {
  if (!env.DB_URL) {
    throw new Error("DB_URL is required to connect to Supabase PostgreSQL");
  }

  const databaseUrl = new URL(env.DB_URL);
  if (
    databaseUrl.protocol !== "postgresql:" &&
    databaseUrl.protocol !== "postgres:"
  ) {
    throw new Error(
      "DB_URL must use the postgresql:// or postgres:// protocol"
    );
  }

  const sslEnabled = env.DB_SSL !== "false";
  return {
    host: databaseUrl.hostname,
    port: parsePositiveInteger(databaseUrl.port, 5432),
    database: databaseUrl.pathname.replace(/^\//, "") || "postgres",
    user:
      env.DB_USERNAME || decodeURIComponent(databaseUrl.username) || undefined,
    password:
      env.DB_PASSWORD || decodeURIComponent(databaseUrl.password) || undefined,
    max: parsePositiveInteger(env.DB_POOL_MAX, 5),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
}

export function getDatabasePool(): Pool {
  pool ??= new Pool(createDatabaseConfig());
  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (!pool) return;
  const currentPool = pool;
  pool = undefined;
  await currentPool.end();
}
