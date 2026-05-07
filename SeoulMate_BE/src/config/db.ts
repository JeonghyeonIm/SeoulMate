import { Pool, type PoolConfig } from "pg";

import { env } from "./env";

const shouldUseSsl = env.DATABASE_SSL && env.NODE_ENV !== "test";

const poolConfig: PoolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
    }
  : {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
    };

export const db = new Pool(poolConfig);
